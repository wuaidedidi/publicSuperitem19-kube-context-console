export type RawKubeConfig = {
  contexts?: Array<{
    name?: string;
    context?: {
      cluster?: string;
      user?: string;
      namespace?: string;
    };
  }>;
  clusters?: Array<{
    name?: string;
    cluster?: {
      server?: string;
      "insecure-skip-tls-verify"?: boolean;
      "certificate-authority-data"?: string;
    };
  }>;
  users?: Array<{
    name?: string;
    user?: Record<string, unknown>;
  }>;
};

export type ParsedContext = {
  name: string;
  namespace: string;
  environment: string;
  clusterName: string;
  clusterServer: string;
  clusterInsecure: boolean;
  userName: string;
  authType: string;
  riskLevel: "low" | "medium" | "high";
  riskReasons: string[];
};

export type ImportResult = {
  source: string;
  summary: string;
  contexts: ParsedContext[];
};

export type DashboardStats = {
  total: number;
  highRisk: number;
  mediumRisk: number;
  lowRisk: number;
  prodLike: number;
};
