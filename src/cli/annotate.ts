import fs from 'fs/promises';

import { parse as parseCsv } from 'csv-parse/sync';
import { stringify as stringifyCsv } from 'csv-stringify/sync';
import { LineRange, RawSourceMap, SourceMapConsumer } from 'source-map-js';

const files = await fs.readdir('./output/filtered/build/machine-translated');

type CsvTranslation = {
  json_path: string,
  original: string,
  translated: string,
  comment?: string,
};
await fs.mkdir('./output/with-context/build/machine-translated/', { recursive: true });
await Promise.all(files.filter((file) => file.endsWith('.csv'))
  .map(async (file) => {
    const csv = await fs.readFile(`./output/filtered/build/machine-translated/${file}`, 'utf-8');
    const inkFile = file === '$meta.buildingBlocks.csv'
      ? 'buildingBlocks.ink'
      : `content/${file.replace('.csv', '.ink')}`;
    const destLines = (await fs.readFile(
      `./serialization/${inkFile}`,
      'utf-8',
    )).split('\n');
    const sourceMapFile = await fs.readFile(
      `./serialization/${inkFile}.map`,
      'utf-8',
    );
    const translations = parseCsv(csv, {
      bom: true,
      cast: false,
      columns: ['json_path', 'original', 'translated', 'comment'],
      skip_empty_lines: true,
      relax_column_count_less: true,
      relax_column_count_more: true,
    }) as CsvTranslation[];
    const sourceMap = new SourceMapConsumer(JSON.parse(sourceMapFile) as RawSourceMap);
    const lineMapping: Record<number, LineRange> = {};
    let lastLine = 1;
    sourceMap.eachMapping((mapping) => {
      const { generatedLine: inkLine, generatedColumn: inkColumn, originalLine: csvLine } = mapping;
      if (csvLine !== lastLine) {
        if (lastLine !== 1) {
          if (inkLine !== lineMapping[lastLine - 2].line) {
            throw new Error(`Line ${lastLine - 1} has multiple positions in source map`);
          }
          lineMapping[lastLine - 2].lastColumn = inkColumn;
        }
        lastLine = csvLine;
      }
      if (csvLine === 1) {
        return;
      }
      if (lineMapping[csvLine - 2] === undefined) {
        lineMapping[csvLine - 2] = {
          line: inkLine,
          column: inkColumn,
          lastColumn: inkColumn,
        };
      }
    });
    const translationsWithContext: CsvTranslation[] = translations.map((translation, i) => {
      const position = lineMapping[i];
      const destLine = position.line - 1;
      const startColumn = position.column;
      const endColumn = position.lastColumn;
      const contextBefore = destLines.slice(
        Math.max(0, destLine - 7),
        destLine,
      ).map((s) => `    ${s}`);
      const contextAfter = destLines.slice(
        destLine + 1,
        Math.max(0, destLine + 8),
      ).map((s) => `    ${s}`);
      const theLine = `>>> ${destLines[destLine]}`;
      const underline = `    ${' '.repeat(startColumn)}${'^'.repeat(Math.max(endColumn - startColumn, 1))}`;
      return {
        ...translation,
        comment: `${translation.comment ? `关联：${translation.comment}\n\n` : ''}上下文：\n${
          [...contextBefore, theLine, underline, ...contextAfter].join('\n').replace(/\n\s+\n/g, '\n')
        }`,
      };
    });
    const translatedCsv = stringifyCsv(translationsWithContext, {
      bom: true,
    });
    await fs.writeFile(
      `./output/with-context/build/machine-translated/${file}`,
      translatedCsv,
    );
  }));
