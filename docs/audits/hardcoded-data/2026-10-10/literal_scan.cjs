/* Read-only token census. Never emits literal values or performs network I/O. */
const fs = require('node:fs');
const path = require('node:path');
const ts = require(path.join(process.argv[2], 'web/node_modules/typescript'));
const files = JSON.parse(fs.readFileSync(0, 'utf8'));
const result = {};
for (const file of files) {
  const source = fs.readFileSync(path.join(process.argv[2], file), 'utf8');
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const tokens = [];
  function visit(node) {
    let kind;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent)) return;
      kind = 'string';
    } else if (ts.isNumericLiteral(node)) kind = 'number';
    else if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) kind = 'boolean';
    else if (node.kind === ts.SyntaxKind.NullKeyword) kind = 'null';
    else if (ts.isJsxText(node) && node.getText(tree).trim()) kind = 'jsx_text';
    if (kind) {
      const pos = node.getStart(tree);
      const loc = tree.getLineAndCharacterOfPosition(pos);
      tokens.push({line: loc.line + 1, column: loc.character + 1, kind});
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  result[file] = tokens;
}
process.stdout.write(JSON.stringify(result));
