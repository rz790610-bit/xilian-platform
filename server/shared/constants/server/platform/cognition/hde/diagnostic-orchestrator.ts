// server/platform/cognition/hde/diagnostic-orchestrator.ts
import { CURRENT_PLATFORM_MODE, PLATFORM_MODE } from "@/shared/constants/platform.constants";
import { Layer1PhysicsFeature } from "./layer1-physics-feature";
import { Layer2ConstrainedReason } from "./layer2-constrained-reason";
import { Layer3KnowledgeCrystal } from "./layer3-knowledge-crystal";
import { AlgorithmBundleLoader } from "@/platform/evolution/bundle/bundle-loader";

export interface DiagnosticRequest {
  deviceId: string;
  sessionId: string;
  rawSignals: RawSignalFrame[];
  timestamp: Date;
  bundleId?: string;  // 商业平台必填，进化平台可选
}

export interface DiagnosticResult {
  sessionId: string;
  conclusion: string;
  confidence: number;
  physicalEvidence: PhysicalEvidence[];  // 物理证据链
  rootCauseChain: CausalChainNode[];     // 根因路径
  grokExplanation: string;               // Grok自然语言解释
  physicsReasonScore: number;            // 物理合理性评分 0-1
  remainingLifeDays?: number;            // S-N疲劳预测剩余寿命
  maintenancePriority: "P1" | "P2" | "P3";
  mode: "evolution" | "commercial";
}

export class DiagnosticOrchestrator {
  constructor(
    private layer1: Layer1PhysicsFeature,
    private layer2: Layer2ConstrainedReason,
    private layer3: Layer3KnowledgeCrystal,
    private bundleLoader: AlgorithmBundleLoader
  ) {}

  async diagnose(req: DiagnosticRequest): Promise<DiagnosticResult> {
    const mode = CURRENT_PLATFORM_MODE;
    if (mode === PLATFORM_MODE.COMMERCIAL) {
      return this.diagnoseCommercial(req);
    }
    return this.diagnoseEvolution(req);
  }

  // 进化模式：完整推理链 + 知识积累
  private async diagnoseEvolution(req: DiagnosticRequest): Promise<DiagnosticResult> {
    const physicalFeatures = await this.layer1.extractWithPhysics(req);
    const reasoningResult = await this.layer2.reasonWithConstraints(physicalFeatures);
    await this.layer3.crystallize(req, reasoningResult);  // 写入飞轮
    return this.buildResult(reasoningResult, "evolution");
  }

  // 商业模式：Bundle固化推理 + 物理强校验
  private async diagnoseCommercial(req: DiagnosticRequest): Promise<DiagnosticResult> {
    const bundle = await this.bundleLoader.load(req.bundleId!);
    const physicalFeatures = await this.layer1.extractWithBundle(req, bundle);
    const reasoningResult = await this.layer2.reasonWithBundle(physicalFeatures, bundle);
    return this.buildResult(reasoningResult, "commercial");
  }

  private buildResult(reasoningResult: any, mode: "evolution" | "commercial"): DiagnosticResult {
    return {
      sessionId: reasoningResult.sessionId,
      conclusion: reasoningResult.conclusion,
      confidence: reasoningResult.confidence,
      physicalEvidence: reasoningResult.physicalEvidence,
      rootCauseChain: reasoningResult.rootCauseChain,
      grokExplanation: reasoningResult.grokExplanation,
      physicsReasonScore: reasoningResult.physicsReasonScore,
      remainingLifeDays: reasoningResult.remainingLifeDays,
      maintenancePriority: reasoningResult.maintenancePriority,
      mode,
    };
  }
}
