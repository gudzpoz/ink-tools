import fs from 'fs/promises';

import { parse as parseCsv } from 'csv-parse/sync';
import { stringify as stringifyCsv } from 'csv-stringify/sync';
import { LineRange, RawSourceMap, SourceMapConsumer } from 'source-map-js';
import { InkChunkNode, InkChunkWithStitches } from '../types';
import { Type_optionLink } from '../auto-types';

const files = await fs.readdir('./output/filtered/build/machine-translated');
const inkFiles = (await fs.readdir('./serialization/content/'))
  .filter((file) => file.endsWith('.ink'));

const divertContexts = Object.fromEntries(await Promise.all(files.filter((file) => file.endsWith('.csv'))
  .map(async (file) => {
    if (file === '$meta.buildingBlocks.csv') {
      return ['', {}];
    }
    const inkFile = `content/${file.replace('.csv', '.ink')}`;
    const sourceMapFile = await fs.readFile(
      `./serialization/${inkFile}.map`,
      'utf-8',
    );
    const sourceMap = new SourceMapConsumer(JSON.parse(sourceMapFile) as RawSourceMap);
    const others = sourceMap.generatedPositionFor({
      line: 1,
      column: 0,
      source: '<input>',
    });
    if (others.line !== 2) {
      throw new Error(`Expected line 2, got ${others.line}`);
    }
    const contexts: Record<string, string> = {};
    const destLines = (await fs.readFile(
      `./serialization/${inkFile}`,
      'utf-8',
    )).split('\n');
    sourceMap.eachMapping((mapping) => {
      const {
        originalLine, originalColumn, generatedLine,
      } = mapping;
      if (originalLine !== 1 || originalColumn === 0) {
        return;
      }
      const line = destLines[generatedLine - 1];
      const [, prefix, name] = /^(=+) (\w+)( ===)?$/.exec(line)!;
      if (prefix.length > 1) {
        if (generatedLine !== 1) {
          throw new Error(`Expected line 1, got ${generatedLine} on ${file} at ${line}`);
        }
        contexts[''] = destLines.slice(0, 8).join('\n').replace(/\n\s+\n/g, '\n');
      } else {
        contexts[name] = destLines.slice(generatedLine - 1, generatedLine + 7)
          .join('\n').replace(/\n\s+\n/g, '\n');
      }
    });
    return [/^\d+-(\w+)\.csv$/.exec(file)![1], contexts];
  }))) as Record<string, Record<string, string>>;

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
    const json = inkFile === 'buildingBlocks.ink' ? {} : JSON.parse(
      await fs.readFile(`./data/chunks/${file.slice(5).replace('.csv', '.json')}`, 'utf-8'),
    ) as InkChunkNode;
    const translationsWithContext: CsvTranslation[] = await Promise.all(
      translations.map(async (translation, i) => {
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

        let comment = `${translation.comment ? `关联：${translation.comment}\n\n` : ''}上下文：\n${
          [...contextBefore, theLine, underline, ...contextAfter].join('\n').replace(/\n\s+\n/g, '\n')
        }`;

        if (translation.json_path.endsWith('option')) {
          comment += '\n选项后文：\n';
          const option = translation.json_path.split('.').slice(0, -1).reduce(
            (obj, key) => (obj as Record<string, unknown>)?.[key],
            json as unknown,
          ) as Type_optionLink;
          if (option.linkPath.startsWith(':')) {
            const [, root, stitch] = option.linkPath.split(':');
            let context;
            if (divertContexts[root]) {
              context = `\n${divertContexts[root][
                stitch ?? (Array.isArray(json) ? '' : (json as InkChunkWithStitches).initial)
              ]}`;
            } else {
              context = (await fs.readFile(
                `./serialization/content/${inkFiles.find((s) => s.includes(`-${root}.ink`))!}`,
                'utf-8',
              )).split('\n').slice(0, 8).join('\n').replace(/\n\s+\n/g, '\n');
            }
            comment += context;
          } else {
            comment += `${divertContexts[/^\d+-(\w+)\.csv$/.exec(file)![1]][option.linkPath]}`;
          }
        }

        return {
          ...translation,
          comment,
        };
      }),
    );
    const translatedCsv = stringifyCsv(translationsWithContext, {
      bom: true,
    });
    await fs.writeFile(
      `./output/with-context/build/machine-translated/${file}`,
      translatedCsv,
    );
  }));
