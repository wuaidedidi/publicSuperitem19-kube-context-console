import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseKubeConfig } from "../src/lib/kubeconfig";
import { saveImportResult } from "../src/lib/repository";
import { getDatabase } from "../src/lib/database";

async function main() {
  const content = readFileSync(join(process.cwd(), "tests/fixtures/sample-kubeconfig.yaml"), "utf8");
  const result = parseKubeConfig(content, "内置验收样本");
  await saveImportResult(result);
  console.log(result.summary);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    getDatabase().close();
  });
