import JSON5 from "json5";
import MagicString from "magic-string";
import { Plugin, normalizePath } from "vite";
import { SourceMapConsumer, SourceMapGenerator } from "source-map";

const importMetaUrl = `${"import"}.meta.url`;
const urlPrefix_normal = "internal:comlink:";
const urlPrefix_shared = "internal:comlink-shared:";

let mode = "";
let root = "";

export function comlink(): Plugin[] {
  return [
    {
      configResolved(conf) {
        mode = conf.mode;
        root = conf.root;
      },
      name: "comlink",
      resolveId(id) {
        if (id.includes(urlPrefix_normal)) {
          return urlPrefix_normal + id.split(urlPrefix_normal)[1];
        }
        if (id.includes(urlPrefix_shared)) {
          return urlPrefix_shared + id.split(urlPrefix_shared)[1];
        }
      },
      async load(id) {
        if (id.includes(urlPrefix_normal)) {
          const realID = normalizePath(id.replace(urlPrefix_normal, ""));

          return `
            import {expose} from 'comlink'
            import * as api from '${normalizePath(realID)}'

            expose(api)
          `;
        }

        if (id.includes(urlPrefix_shared)) {
          const realID = normalizePath(id.replace(urlPrefix_shared, ""));

          return `
            import {expose} from 'comlink'
            import * as api from '${normalizePath(realID)}'

            addEventListener('connect', (event) => {
                const port = event.ports[0];
                  
                expose(api, port);
                // We might need this later...
                // port.start()
            })
          `;
        }
      },
      async transform(code: string, id: string) {
        if (
          !code.includes("ComlinkWorker") &&
          !code.includes("ComlinkSharedWorker")
        )
          return;

        const workerSearcher = /(?<new>\bnew\s+)(?<type>ComlinkWorker|ComlinkSharedWorker)(?<new_url>\s*\(\s*new\s+URL\s*\(\s*)(?<quote>['"`])?(?<path>(?=<')[^']+(?=')|(?<=")[^"]+(?=")|(?<=`)[^`]+(?=`)|\w+)['"`]?(?<import_meta>\s*,\s*import\.meta\.url\s*\)\s*|\s*\)\s*)(?<comma>,?)(?<options>[^\)]*)(?<end>\))/g;


        let s: MagicString = new MagicString(code);

        const matches = code.matchAll(workerSearcher);

        for (const match of matches) {
          if (!match.groups)
            continue
          const index = match.index!;
          const matchCode = match[0];
          const c1_new = match.groups["new"]
          const c2_type = match.groups["type"];
          const c3_new_url = match.groups["new_url"];
          const c4_quote = match.groups["quote"];
          let c4_path = match.groups["path"];
          const c5_import_meta = match.groups["import_meta"];
          const c6_comma = match.groups["comma"];
          const c7_options = match.groups["options"];
          const c8_end = match.groups["end"];

          const opt = c7_options ? JSON5.parse(c7_options) : {};

          const urlQuote = ['"', "`", "'"].includes(c4_quote) ? c4_quote : "`";
          const pathEscapeStart = ['"', "`", "'"].includes(c4_quote) ? "" : "${";
          const pathEscapeEnd = ['"', "`", "'"].includes(c4_quote) ? "" : "}";

          if (mode === "development") {
            opt.type = "module";
          }
          const options = JSON.stringify(opt);

          const prefix =
            c2_type === "ComlinkWorker" ? urlPrefix_normal : urlPrefix_shared;
          const className =
            c2_type == "ComlinkWorker" ? "Worker" : "SharedWorker";

          const res = await this.resolve(c4_path, id, {});
          let path = c4_path;

          if (res) {
            path = res.id;
            if (path.startsWith(root)) {
              path = path.substring(root.length);
            }
          }
          const worker_constructor = `${c1_new}${className}${c3_new_url}${urlQuote}${prefix}${pathEscapeStart}${path}${pathEscapeEnd}${urlQuote}${c5_import_meta},${options}${c8_end}`;

          const insertCode = `___wrap(${worker_constructor});\n`;

          s.overwrite(index, index + matchCode.length, insertCode);
        }

        s.appendLeft(
          0,
          `import {wrap as ___wrap} from '@opliko/vite-plugin-comlink/symbol';\n`
        );

        const prevSourcemapConsumer = await new SourceMapConsumer(
          this.getCombinedSourcemap()
        );
        const thisSourcemapConsumer = await new SourceMapConsumer(
          s.generateMap()
        );

        const sourceMapGen = SourceMapGenerator.fromSourceMap(
          thisSourcemapConsumer
        );
        sourceMapGen.applySourceMap(prevSourcemapConsumer, id);

        return {
          code: s.toString(),
          map: sourceMapGen.toJSON(),
        };
      },
    } as Plugin,
  ];
}

export default comlink;
