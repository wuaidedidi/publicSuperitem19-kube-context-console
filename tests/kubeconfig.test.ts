import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseKubeConfig, parseImportInput } from "../src/lib/kubeconfig";

const fixture = readFileSync(join(process.cwd(), "tests/fixtures/sample-kubeconfig.yaml"), "utf8");

describe("parseKubeConfig", () => {
  it("从 kubeconfig 中解析 context、cluster、user 和风险信息", () => {
    const result = parseKubeConfig(fixture, "测试导入");

    expect(result.source).toBe("测试导入");
    expect(result.contexts).toHaveLength(2);
    expect(result.summary).toContain("导入 2 个 context");

    const prod = result.contexts.find((item) => item.name === "prod-admin");
    expect(prod).toMatchObject({
      namespace: "default",
      environment: "生产",
      clusterName: "prod-shanghai",
      userName: "platform-admin",
      authType: "static-token",
      riskLevel: "high"
    });
    expect(prod?.riskReasons).toEqual(
      expect.arrayContaining(["生产 context 仍使用 default namespace", "跳过 TLS 校验", "使用静态 token 认证"])
    );
  });

  it("忽略缺少 cluster 或 user 绑定的不完整 context", () => {
    expect(() =>
      parseKubeConfig(`apiVersion: v1
kind: Config
clusters:
- name: prod-shanghai
  cluster:
    server: https://k8s-prod.example.com
users:
- name: platform-admin
  user:
    token: redacted-token
contexts:
- name: broken
  context:
    cluster: prod-shanghai
`)
    ).toThrow("没有发现可导入的 context");
  });

  it("拒绝明显不完整的导入请求", () => {
    expect(() => parseImportInput({ source: "空白", content: "apiVersion: v1" })).toThrow("kubeconfig 内容过短");
  });
});
