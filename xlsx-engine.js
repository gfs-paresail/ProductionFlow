/**
 * Native In-Browser XLSX, CSV & TSV Parser & Generator
 * Zero external dependencies. Uses Central Directory parsing and native DecompressionStream.
 */
(function(root) {
  'use strict';

  // Micro-inflate fallback in case DecompressionStream is unavailable
  function inflateRawFallback(compressed) {
    // If DecompressionStream exists, it is preferred.
    throw new Error('DecompressionStream not supported');
  }

  // Decompress raw deflate data
  async function decompressDeflateRaw(compressedBytes) {
    if (typeof DecompressionStream !== 'undefined') {
      try {
        const ds = new DecompressionStream('deflate-raw');
        const writer = ds.writable.getWriter();
        writer.write(compressedBytes);
        writer.close();
        const buffer = await new Response(ds.readable).arrayBuffer();
        return new Uint8Array(buffer);
      } catch (e) {
        // Some zips might have zlib header (deflate with 78 9c)
        try {
          const ds = new DecompressionStream('deflate');
          const writer = ds.writable.getWriter();
          writer.write(compressedBytes);
          writer.close();
          const buffer = await new Response(ds.readable).arrayBuffer();
          return new Uint8Array(buffer);
        } catch (err2) {
          throw new Error('압축 해제 실패: ' + e.message);
        }
      }
    }
    return inflateRawFallback(compressedBytes);
  }

  // Convert Column Name like 'A', 'B', 'AA' to 0-based index
  function colNameToIndex(colName) {
    let index = 0;
    const clean = colName.toUpperCase().trim();
    for (let i = 0; i < clean.length; i++) {
      index = index * 26 + (clean.charCodeAt(i) - 64);
    }
    return index - 1;
  }

  // Convert 0-based column index to 'A', 'B', 'AA'
  function indexToColName(index) {
    let num = index + 1;
    let colName = '';
    while (num > 0) {
      let rem = (num - 1) % 26;
      colName = String.fromCharCode(65 + rem) + colName;
      num = Math.floor((num - 1) / 26);
    }
    return colName;
  }

  // Parse cell reference like 'B13' into { col: 1, row: 12 } (0-based)
  function parseCellRef(ref) {
    const match = ref.match(/^([A-Z]+)([0-9]+)$/i);
    if (!match) return null;
    return {
      col: colNameToIndex(match[1]),
      row: parseInt(match[2], 10) - 1
    };
  }

  // ZIP Reader using Central Directory
  async function readZipEntries(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    const bytes = new Uint8Array(arrayBuffer);
    const len = arrayBuffer.byteLength;

    // Search for End of Central Directory Record (0x06054b50) from the end
    let eocdOffset = -1;
    for (let i = len - 22; i >= Math.max(0, len - 65557); i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }
    if (eocdOffset === -1) {
      throw new Error('유효한 ZIP/XLSX 파일 구조를 찾을 수 없습니다.');
    }

    const totalEntries = view.getUint16(eocdOffset + 10, true);
    const cdOffset = view.getUint32(eocdOffset + 16, true);

    const entries = {};
    let p = cdOffset;
    const decoder = new TextDecoder('utf-8');

    for (let i = 0; i < totalEntries; i++) {
      if (p + 46 > len) break;
      const sig = view.getUint32(p, true);
      if (sig !== 0x02014b50) break; // Not central directory header

      const compMethod = view.getUint16(p + 10, true);
      const compSize = view.getUint32(p + 20, true);
      const uncompSize = view.getUint32(p + 24, true);
      const nameLen = view.getUint16(p + 28, true);
      const extraLen = view.getUint16(p + 30, true);
      const commentLen = view.getUint16(p + 32, true);
      const localHeaderOffset = view.getUint32(p + 42, true);

      const nameBytes = bytes.subarray(p + 46, p + 46 + nameLen);
      const fileName = decoder.decode(nameBytes);

      // Read local header to get start of data
      if (localHeaderOffset + 30 <= len) {
        const localSig = view.getUint32(localHeaderOffset, true);
        if (localSig === 0x04034b50) {
          const localNameLen = view.getUint16(localHeaderOffset + 26, true);
          const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
          const dataOffset = localHeaderOffset + 30 + localNameLen + localExtraLen;
          const compressedData = bytes.subarray(dataOffset, dataOffset + compSize);

          entries[fileName] = {
            compMethod,
            compSize,
            uncompSize,
            data: compressedData
          };
        }
      }

      p += 46 + nameLen + extraLen + commentLen;
    }

    return entries;
  }

  // Extract a text file from zip entries
  async function getZipEntryText(entries, targetPath) {
    // Normalise slash
    const normTarget = targetPath.replace(/\\/g, '/');
    let entry = entries[normTarget];
    if (!entry) {
      // Case-insensitive search
      for (const k of Object.keys(entries)) {
        if (k.toLowerCase() === normTarget.toLowerCase()) {
          entry = entries[k];
          break;
        }
      }
    }
    if (!entry) return null;

    let uncompressedBytes;
    if (entry.compMethod === 0) {
      // Stored (no compression)
      uncompressedBytes = entry.data;
    } else if (entry.compMethod === 8) {
      // Deflated
      uncompressedBytes = await decompressDeflateRaw(entry.data);
    } else {
      throw new Error(`지원하지 않는 압축 방식: ${entry.compMethod}`);
    }

    return new TextDecoder('utf-8').decode(uncompressedBytes);
  }

  // Parse SharedStrings XML
  function parseSharedStrings(xmlStr) {
    if (!xmlStr) return [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlStr, 'text/xml');
    const siElements = doc.getElementsByTagName('si');
    const strings = [];

    for (let i = 0; i < siElements.length; i++) {
      const si = siElements[i];
      // May contain multiple <t> inside <r>
      const tElements = si.getElementsByTagName('t');
      let text = '';
      for (let j = 0; j < tElements.length; j++) {
        text += tElements[j].textContent || '';
      }
      strings.push(text);
    }
    return strings;
  }

  // Parse Worksheet XML into 2D Array of raw values
  function parseWorksheetXml(xmlStr, sharedStrings) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlStr, 'text/xml');
    const rowElements = doc.getElementsByTagName('row');

    const sheetData = [];

    for (let i = 0; i < rowElements.length; i++) {
      const rowEl = rowElements[i];
      const rAttr = rowEl.getAttribute('r');
      const rowIndex = rAttr ? parseInt(rAttr, 10) - 1 : i;

      // Ensure sheetData has rows up to rowIndex
      while (sheetData.length <= rowIndex) {
        sheetData.push([]);
      }

      const cElements = rowEl.getElementsByTagName('c');
      for (let j = 0; j < cElements.length; j++) {
        const cEl = cElements[j];
        const r = cEl.getAttribute('r');
        let colIndex = j;
        if (r) {
          const parsed = parseCellRef(r);
          if (parsed) colIndex = parsed.col;
        }

        const t = cEl.getAttribute('t'); // 's' for shared string, 'inlineStr' etc.
        let val = '';

        if (t === 's') {
          const vEl = cEl.getElementsByTagName('v')[0];
          if (vEl) {
            const sIndex = parseInt(vEl.textContent.trim(), 10);
            val = sharedStrings[sIndex] !== undefined ? sharedStrings[sIndex] : '';
          }
        } else if (t === 'inlineStr') {
          const isEl = cEl.getElementsByTagName('is')[0];
          if (isEl) {
            const tEl = isEl.getElementsByTagName('t')[0];
            val = tEl ? tEl.textContent : '';
          }
        } else {
          // Numbers, booleans, formulas
          const vEl = cEl.getElementsByTagName('v')[0];
          if (vEl) {
            val = vEl.textContent;
          }
        }

        // Place value into sheet row
        const targetRow = sheetData[rowIndex];
        while (targetRow.length <= colIndex) {
          targetRow.push('');
        }
        targetRow[colIndex] = val;
      }
    }

    return sheetData;
  }

  // Parse Workbook XML to find sheet names and paths
  function parseWorkbook(xmlStr) {
    if (!xmlStr) return [{ name: 'Sheet1', target: 'worksheets/sheet1.xml' }];
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlStr, 'text/xml');
    const sheetsEl = doc.getElementsByTagName('sheet');
    const sheets = [];

    for (let i = 0; i < sheetsEl.length; i++) {
      const s = sheetsEl[i];
      const name = s.getAttribute('name') || `Sheet${i + 1}`;
      const sheetId = s.getAttribute('sheetId') || String(i + 1);
      sheets.push({
        name,
        target: `worksheets/sheet${i + 1}.xml`
      });
    }
    return sheets.length > 0 ? sheets : [{ name: 'Sheet1', target: 'worksheets/sheet1.xml' }];
  }

  // Main XLSX parser function
  async function parseXLSX(arrayBuffer) {
    const entries = await readZipEntries(arrayBuffer);
    const sharedStringsXml = await getZipEntryText(entries, 'xl/sharedStrings.xml');
    const sharedStrings = parseSharedStrings(sharedStringsXml);

    const workbookXml = await getZipEntryText(entries, 'xl/workbook.xml');
    const sheetDefs = parseWorkbook(workbookXml);

    const resultSheets = {};

    for (let idx = 0; idx < sheetDefs.length; idx++) {
      const def = sheetDefs[idx];
      let sheetXml = await getZipEntryText(entries, `xl/${def.target}`);
      if (!sheetXml) {
        // Fallback check
        sheetXml = await getZipEntryText(entries, `xl/worksheets/sheet${idx + 1}.xml`);
      }
      if (sheetXml) {
        resultSheets[def.name] = parseWorksheetXml(sheetXml, sharedStrings);
      }
    }

    // Default to first sheet or active sheet
    const sheetNames = Object.keys(resultSheets);
    if (sheetNames.length === 0) {
      throw new Error('시트 데이터를 찾을 수 없습니다.');
    }

    return {
      sheetNames,
      sheets: resultSheets,
      activeSheet: resultSheets[sheetNames[0]]
    };
  }

  // CSV & TSV Text Parser (handles quoted strings, commas, tabs, Windows CRLF)
  function parseDelimitedText(text, delimiter) {
    if (!delimiter) {
      // Auto-detect delimiter: tab vs comma vs semicolon
      const firstLine = text.split(/\r?\n/)[0] || '';
      const tabs = (firstLine.match(/\t/g) || []).length;
      const commas = (firstLine.match(/,/g) || []).length;
      const semicolons = (firstLine.match(/;/g) || []).length;

      if (tabs >= commas && tabs >= semicolons && tabs > 0) delimiter = '\t';
      else if (semicolons > commas) delimiter = ';';
      else delimiter = ',';
    }

    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          currentCell += '"';
          i++; // skip escaped quote
        } else if (char === '"') {
          inQuotes = false;
        } else {
          currentCell += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === delimiter) {
          currentRow.push(currentCell.trim());
          currentCell = '';
        } else if (char === '\r') {
          if (nextChar === '\n') i++;
          currentRow.push(currentCell.trim());
          rows.push(currentRow);
          currentRow = [];
          currentCell = '';
        } else if (char === '\n') {
          currentRow.push(currentCell.trim());
          rows.push(currentRow);
          currentRow = [];
          currentCell = '';
        } else {
          currentCell += char;
        }
      }
    }

    if (currentCell.length > 0 || currentRow.length > 0) {
      currentRow.push(currentCell.trim());
      rows.push(currentRow);
    }

    return rows;
  }

  // Parse HTML Table (.xls exported by Korean ERP/MES systems)
  function parseHtmlTable(htmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');
    const tables = doc.querySelectorAll('table');
    if (!tables || tables.length === 0) return [];
    // Pick the largest table
    let bestTable = tables[0];
    let maxRows = 0;
    tables.forEach(t => {
      const len = t.querySelectorAll('tr').length;
      if (len > maxRows) {
        maxRows = len;
        bestTable = t;
      }
    });

    const grid = [];
    const trs = bestTable.querySelectorAll('tr');
    trs.forEach((tr, rIdx) => {
      if (!grid[rIdx]) grid[rIdx] = [];
      let cIdx = 0;
      const cells = tr.querySelectorAll('th, td');
      cells.forEach(cell => {
        while (grid[rIdx][cIdx] !== undefined) cIdx++;
        const colspan = parseInt(cell.getAttribute('colspan') || '1', 10) || 1;
        const rowspan = parseInt(cell.getAttribute('rowspan') || '1', 10) || 1;
        const val = (cell.textContent || '').replace(/\u00a0/g, ' ').trim();
        for (let r = 0; r < rowspan; r++) {
          if (!grid[rIdx + r]) grid[rIdx + r] = [];
          for (let c = 0; c < colspan; c++) {
            grid[rIdx + r][cIdx + c] = (r === 0 && c === 0) ? val : '';
          }
        }
        cIdx += colspan;
      });
    });
    return grid;
  }

  // Parse Excel 2003 XML SpreadsheetML (.xls)
  function parseSpreadsheetML(xmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');
    const rowEls = doc.querySelectorAll('Row');
    const grid = [];
    rowEls.forEach((rowEl, rIdx) => {
      const rowIdxAttr = rowEl.getAttribute('ss:Index') || rowEl.getAttribute('Index');
      const targetR = rowIdxAttr ? parseInt(rowIdxAttr, 10) - 1 : rIdx;
      while (grid.length <= targetR) grid.push([]);
      let cIdx = 0;
      const cellEls = rowEl.querySelectorAll('Cell');
      cellEls.forEach(cellEl => {
        const colIdxAttr = cellEl.getAttribute('ss:Index') || cellEl.getAttribute('Index');
        if (colIdxAttr) cIdx = parseInt(colIdxAttr, 10) - 1;
        const dataEl = cellEl.querySelector('Data');
        const val = dataEl ? (dataEl.textContent || '').trim() : '';
        grid[targetR][cIdx] = val;
        cIdx++;
      });
    });
    return grid;
  }

  // Decode buffer with UTF-8 first, fallback to EUC-KR if replacement chars appear
  function decodeTextSmart(buffer) {
    const bytes = new Uint8Array(buffer);
    const utf8Text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    if (utf8Text.includes('\uFFFD')) {
      try {
        const euckrText = new TextDecoder('euc-kr', { fatal: false }).decode(bytes);
        if (!euckrText.includes('\uFFFD') || euckrText.split('\uFFFD').length < utf8Text.split('\uFFFD').length) {
          return euckrText;
        }
      } catch (e) { /* ignore */ }
    }
    return utf8Text;
  }

  // High-performance file reader auto-dispatcher
  async function parseSpreadsheetFile(file) {
    const fileName = file.name || '';
    const ext = fileName.split('.').pop().toLowerCase();
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // 1) ZIP-based XLSX/XLSM (PK\x03\x04)
    if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04) {
      const xlsxResult = await parseXLSX(buffer);
      return {
        fileName,
        type: 'xlsx',
        sheets: xlsxResult.sheets,
        sheetNames: xlsxResult.sheetNames,
        data: xlsxResult.activeSheet
      };
    }

    // 2) Legacy BIFF8 binary .xls (D0 CF 11 E0) -> load SheetJS on demand if available
    if (bytes.length >= 4 && bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0) {
      if (typeof root.XLSX === 'undefined') {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
          s.onload = resolve;
          s.onerror = () => reject(new Error('바이너리 .xls 파서(SheetJS) 로드에 실패했습니다. .xlsx 또는 .csv로 저장 후 업로드해 주세요.'));
          document.head.appendChild(s);
        });
      }
      const wb = root.XLSX.read(bytes, { type: 'array' });
      const firstSheet = wb.SheetNames[0];
      const rows = root.XLSX.utils.sheet_to_json(wb.Sheets[firstSheet], { header: 1, defval: '' });
      return {
        fileName,
        type: 'xls-biff',
        sheetNames: wb.SheetNames,
        sheets: { [firstSheet]: rows },
        data: rows
      };
    }

    // 3) Text-based formats: HTML .xls, XML SpreadsheetML .xls, CSV, TSV
    const text = decodeTextSmart(buffer);
    const trimmed = text.trimStart().toLowerCase();

    if (trimmed.includes('<table') && (trimmed.includes('<html') || trimmed.includes('<tr'))) {
      const rows = parseHtmlTable(text);
      return {
        fileName,
        type: 'xls-html',
        sheetNames: ['Sheet1'],
        sheets: { Sheet1: rows },
        data: rows
      };
    }

    if (trimmed.includes('<workbook') && trimmed.includes('<row')) {
      const rows = parseSpreadsheetML(text);
      return {
        fileName,
        type: 'xls-xml',
        sheetNames: ['Sheet1'],
        sheets: { Sheet1: rows },
        data: rows
      };
    }

    const rows = parseDelimitedText(text);
    return {
      fileName,
      type: ext || 'text',
      sheetNames: ['Sheet1'],
      sheets: { Sheet1: rows },
      data: rows
    };
  }

  // Export 2D array to CSV with UTF-8 BOM (opens perfectly in Korean Excel)
  function exportToCSV(rows, fileName = 'export.csv') {
    const BOM = '\uFEFF';
    const csvContent = rows.map(row => {
      return (row || []).map(cell => {
        let val = cell === null || cell === undefined ? '' : String(cell);
        if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r')) {
          val = '"' + val.replace(/"/g, '""') + '"';
        }
        return val;
      }).join(',');
    }).join('\r\n');

    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }

  // Export 2D array to Tab-Separated text (TSV) for clipboard
  function exportToTSV(rows) {
    return rows.map(row => {
      return (row || []).map(cell => {
        return cell === null || cell === undefined ? '' : String(cell).replace(/\t/g, ' ');
      }).join('\t');
    }).join('\r\n');
  }

  // Export to Excel-compatible HTML/SpreadsheetML table (.xls)
  function exportToExcelXML(sheetName, headers2Tier, rows, fileName = 'production_plan.xls') {
    let html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:x="urn:schemas-microsoft-com:office:excel"
            xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
        <style>
          table { border-collapse: collapse; font-family: 'Malgun Gothic', sans-serif; font-size: 11px; }
          th { background-color: #f1f5f9; color: #1e293b; border: 1px solid #cbd5e1; padding: 6px 10px; font-weight: 600; text-align: center; }
          td { border: 1px solid #e2e8f0; padding: 5px 8px; }
          .num { text-align: right; mso-number-format:"\\#,##0"; }
          .center { text-align: center; }
          .diff { background-color: #fef08a; }
          .shortage { color: #dc2626; font-weight: bold; }
        </style>
      </head>
      <body>
        <table>
    `;

    // 2-tier headers
    if (headers2Tier && headers2Tier.length === 2) {
      html += '<thead>';
      html += '<tr>' + headers2Tier[0].map(h => `<th rowspan="${h.rowspan || 1}" colspan="${h.colspan || 1}">${h.text}</th>`).join('') + '</tr>';
      if (headers2Tier[1].length > 0) {
        html += '<tr>' + headers2Tier[1].map(h => `<th>${h.text}</th>`).join('') + '</tr>';
      }
      html += '</thead>';
    }

    html += '<tbody>';
    for (const row of rows) {
      html += '<tr>';
      for (const cell of row) {
        const isNum = typeof cell === 'number' || (!isNaN(cell) && cell !== '' && typeof cell !== 'boolean');
        const numClass = isNum ? 'class="num"' : '';
        html += `<td ${numClass}>${cell !== undefined && cell !== null ? cell : ''}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table></body></html>';

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }

  // Export multiple worksheets to a single SpreadsheetML 2003 XML workbook (.xls)
  function exportMultiSheetWorkbook(sheets, fileName = 'export.xls') {
    const escXml = (s) => String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    const sanitizeSheetName = (name) => String(name || 'Sheet')
      .replace(/[\\/*?:[\]]/g, '_')
      .slice(0, 31);

    const worksheetsXml = (sheets || []).map((sh) => {
      const colsXml = Array.isArray(sh.colWidths)
        ? sh.colWidths.map((w) => `<Column ss:AutoFitWidth="0" ss:Width="${w}"/>`).join('')
        : '';

      const sourceRows = sh.rows || sh.aoa || [];
      const rowsXml = sourceRows.map((rowObj) => {
        const isRowObj = rowObj && !Array.isArray(rowObj);
        const cells = isRowObj ? (rowObj.cells || []) : (rowObj || []);
        const rowAttr = (isRowObj && rowObj.height) ? ` ss:Height="${rowObj.height}"` : '';

        const cellsXml = cells.map((cell) => {
          const isObj = cell !== null && typeof cell === 'object' && !Array.isArray(cell);
          const val = isObj ? cell.v : cell;
          const styleId = isObj ? cell.style : ((typeof val === 'number' && Number.isFinite(val)) ? 'Num' : '');
          const attrs = [];
          if (styleId) attrs.push(`ss:StyleID="${styleId}"`);
          if (isObj && cell.index) attrs.push(`ss:Index="${cell.index}"`);
          if (isObj && cell.mergeAcross) attrs.push(`ss:MergeAcross="${cell.mergeAcross}"`);
          if (isObj && cell.mergeDown) attrs.push(`ss:MergeDown="${cell.mergeDown}"`);
          const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';

          if (val === null || val === undefined || val === '') {
            return `<Cell${attrStr}><Data ss:Type="String"></Data></Cell>`;
          }
          if (typeof val === 'number' && Number.isFinite(val)) {
            return `<Cell${attrStr}><Data ss:Type="Number">${val}</Data></Cell>`;
          }
          return `<Cell${attrStr}><Data ss:Type="String">${escXml(val)}</Data></Cell>`;
        }).join('');
        return `<Row${rowAttr}>${cellsXml}</Row>`;
      }).join('');

      return `<Worksheet ss:Name="${escXml(sanitizeSheetName(sh.name))}"><Table>${colsXml}${rowsXml}</Table></Worksheet>`;
    }).join('');

    const thinBorder = (color) => `
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${color}"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${color}"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${color}"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${color}"/>
      </Borders>`;

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Center"/>
      <Font ss:FontName="맑은 고딕" ss:Size="10"/>
    </Style>
    <Style ss:ID="Num">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="맑은 고딕" ss:Size="10"/>
      <NumberFormat ss:Format="#,##0"/>
    </Style>
    <Style ss:ID="Title">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="맑은 고딕" ss:Size="14" ss:Bold="1"/>
    </Style>
    <Style ss:ID="SubLabel">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="맑은 고딕" ss:Size="10" ss:Bold="1"/>
    </Style>
    <Style ss:ID="SubVal">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="맑은 고딕" ss:Size="10" ss:Bold="1"/>
    </Style>
    <Style ss:ID="Th">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
      <Font ss:FontName="맑은 고딕" ss:Size="10" ss:Bold="1" ss:Color="#0F172A"/>
      <Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/>
      ${thinBorder('#CBD5E1')}
    </Style>
    <Style ss:ID="CellText">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="맑은 고딕" ss:Size="10"/>
      ${thinBorder('#CBD5E1')}
    </Style>
    <Style ss:ID="CellCenter">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="맑은 고딕" ss:Size="10"/>
      ${thinBorder('#CBD5E1')}
    </Style>
    <Style ss:ID="CellNum">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="맑은 고딕" ss:Size="10"/>
      <NumberFormat ss:Format="#,##0"/>
      ${thinBorder('#CBD5E1')}
    </Style>
    <Style ss:ID="CellNeg">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="맑은 고딕" ss:Size="10" ss:Color="#DC2626"/>
      <NumberFormat ss:Format="#,##0"/>
      ${thinBorder('#CBD5E1')}
    </Style>
    <Style ss:ID="SumText">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="맑은 고딕" ss:Size="10" ss:Bold="1" ss:Color="#0F172A"/>
      <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
      ${thinBorder('#94A3B8')}
    </Style>
    <Style ss:ID="SumNum">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="맑은 고딕" ss:Size="10" ss:Bold="1" ss:Color="#0F172A"/>
      <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
      <NumberFormat ss:Format="#,##0"/>
      ${thinBorder('#94A3B8')}
    </Style>
    <Style ss:ID="NoteBox">
      <Alignment ss:Horizontal="Left" ss:Vertical="Top" ss:WrapText="1"/>
      <Font ss:FontName="맑은 고딕" ss:Size="9.5"/>
      ${thinBorder('#CBD5E1')}
    </Style>
  </Styles>
  ${worksheetsXml}
</Workbook>`;

    const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }

  // Export public API
  root.XLSXEngine = {
    colNameToIndex,
    indexToColName,
    parseCellRef,
    parseXLSX,
    parseDelimitedText,
    parseSpreadsheetFile,
    exportToCSV,
    exportToTSV,
    exportToExcelXML,
    exportMultiSheetWorkbook
  };

})(typeof window !== 'undefined' ? window : this);
