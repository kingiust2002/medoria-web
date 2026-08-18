import { strToU8, zipSync } from "fflate";

const TIER = {
  required: { body: "FBE9E9", header: "C62828", labelFont: 2, labelStyle: 3, keyStyle: 6, exampleStyle: 9 },
  auto: { body: "E9F4EA", header: "2E7D32", labelFont: 3, labelStyle: 4, keyStyle: 7, exampleStyle: 10 },
  optional: { body: "E9F1FB", header: "1565C0", labelFont: 4, labelStyle: 5, keyStyle: 8, exampleStyle: 11 },
};

const YESNO = new Set(["price_on_request", "in_stock", "is_active", "is_featured"]);
const MAX_TEMPLATE_ROWS = 500;

function xml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function columnLetter(index) {
  let value = index;
  let output = "";
  while (value > 0) {
    value -= 1;
    output = String.fromCharCode(65 + (value % 26)) + output;
    value = Math.floor(value / 26);
  }
  return output;
}

function widthFor(column) {
  const base = Math.max(
    String(column.label || "").length * 0.9,
    String(column.example || "").length + 2,
    String(column.key || "").length + 2
  );
  return Math.min(Math.max(base, 12), 42);
}

function inlineStringCell(reference, style, value) {
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}

function contentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
}

function rootRelationshipsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function workbookXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <workbookPr/>
  <bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews>
  <sheets><sheet name="محصولات" sheetId="1" r:id="rId1"/></sheets>
  <calcPr calcId="191029" fullCalcOnLoad="1"/>
</workbook>`;
}

function workbookRelationshipsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="8">
    <font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="15"/><color rgb="FF1A1A2E"/><name val="Tahoma"/></font>
    <font><sz val="9"/><color rgb="FFC62828"/><name val="Tahoma"/></font>
    <font><sz val="9"/><color rgb="FF2E7D32"/><name val="Tahoma"/></font>
    <font><sz val="9"/><color rgb="FF1565C0"/><name val="Tahoma"/></font>
    <font><sz val="10"/><color rgb="FF444444"/><name val="Tahoma"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Tahoma"/></font>
    <font><i/><sz val="10"/><color rgb="FF8A8A8A"/><name val="Tahoma"/></font>
  </fonts>
  <fills count="9">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF4F1EA"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFBE9E9"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE9F4EA"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE9F1FB"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFC62828"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF2E7D32"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1565C0"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFDDDDDD"/></left>
      <right style="thin"><color rgb="FFDDDDDD"/></right>
      <top style="thin"><color rgb="FFDDDDDD"/></top>
      <bottom style="thin"><color rgb="FFDDDDDD"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="12">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="4" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="6" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="6" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="6" fillId="8" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="7" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="7" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="7" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function worksheetXml(columns, brand) {
  const lastColumn = columnLetter(columns.length);
  const columnDefinitions = columns
    .map((column, index) => {
      const position = index + 1;
      return `<col min="${position}" max="${position}" width="${widthFor(column)}" customWidth="1"/>`;
    })
    .join("");

  const rowThree = columns
    .map((column, index) => {
      const tier = TIER[column.tier] || TIER.optional;
      return inlineStringCell(`${columnLetter(index + 1)}3`, tier.labelStyle, column.label);
    })
    .join("");

  const rowFour = columns
    .map((column, index) => {
      const tier = TIER[column.tier] || TIER.optional;
      return inlineStringCell(`${columnLetter(index + 1)}4`, tier.keyStyle, column.key);
    })
    .join("");

  const rowFive = columns
    .map((column, index) => {
      const tier = TIER[column.tier] || TIER.optional;
      return inlineStringCell(`${columnLetter(index + 1)}5`, tier.exampleStyle, column.example || "");
    })
    .join("");

  const validationXml = columns
    .map((column, index) => {
      let formula = null;
      if (YESNO.has(column.key)) formula = '"yes,no"';
      if (column.key === "badge") formula = '"NEW,TOP,SALE"';
      if (!formula) return null;

      const letter = columnLetter(index + 1);
      return `<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="${xml("مقدار نامعتبر")}" error="${xml("از فهرست انتخاب کن.")}" sqref="${letter}6:${letter}${MAX_TEMPLATE_ROWS + 5}"><formula1>${xml(formula)}</formula1></dataValidation>`;
    })
    .filter(Boolean);

  const legend =
    "راهنما:  🔴 قرمز = اجباری (نام را حداقل به یک زبان بنویس)   •   🟢 سبز = خودکار پر می‌شود اگر خالی بگذاری (کد محصول، اسلاگ، وضعیت‌ها و ترجمهٔ زبان‌ها)   •   🔵 آبی = اختیاری";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastColumn}${MAX_TEMPLATE_ROWS + 5}"/>
  <sheetViews>
    <sheetView rightToLeft="1" workbookViewId="0">
      <pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/>
      <selection pane="bottomLeft" activeCell="A5" sqref="A5"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>${columnDefinitions}</cols>
  <sheetData>
    <row r="1" ht="30" customHeight="1">${inlineStringCell("A1", 1, `قالب ورود محصولات ${brand}`)}</row>
    <row r="2" ht="30" customHeight="1">${inlineStringCell("A2", 2, legend)}</row>
    <row r="3" ht="42" customHeight="1">${rowThree}</row>
    <row r="4" ht="22" customHeight="1">${rowFour}</row>
    <row r="5" ht="20" customHeight="1">${rowFive}</row>
  </sheetData>
  <mergeCells count="2"><mergeCell ref="A1:${lastColumn}1"/><mergeCell ref="A2:${lastColumn}2"/></mergeCells>
  ${validationXml.length ? `<dataValidations count="${validationXml.length}">${validationXml.join("")}</dataValidations>` : ""}
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`;
}

function corePropertiesXml(brand, createdAt) {
  const timestamp = createdAt.toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>${xml(brand)}</dc:creator>
  <cp:lastModifiedBy>${xml(brand)}</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:modified>
</cp:coreProperties>`;
}

function appPropertiesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Medoria</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>1</vt:i4></vt:variant></vt:vector></HeadingPairs>
  <TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>محصولات</vt:lpstr></vt:vector></TitlesOfParts>
  <Company>Medoria</Company>
  <LinksUpToDate>false</LinksUpToDate>
  <SharedDoc>false</SharedDoc>
  <HyperlinksChanged>false</HyperlinksChanged>
  <AppVersion>1.0</AppVersion>
</Properties>`;
}

export function buildStyledTemplateXlsx({ columns, brand = "Medoria", createdAt = new Date() }) {
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new TypeError("columns must be a non-empty array");
  }

  const requiredKeys = new Set();
  for (const column of columns) {
    if (!column?.key || requiredKeys.has(column.key)) {
      throw new TypeError("every template column must have a unique non-empty key");
    }
    requiredKeys.add(column.key);
  }

  const files = {
    "[Content_Types].xml": strToU8(contentTypesXml()),
    "_rels/.rels": strToU8(rootRelationshipsXml()),
    "docProps/core.xml": strToU8(corePropertiesXml(brand, createdAt)),
    "docProps/app.xml": strToU8(appPropertiesXml()),
    "xl/workbook.xml": strToU8(workbookXml()),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRelationshipsXml()),
    "xl/styles.xml": strToU8(stylesXml()),
    "xl/worksheets/sheet1.xml": strToU8(worksheetXml(columns, brand)),
  };

  return zipSync(files, { level: 6 });
}
