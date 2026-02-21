# Dialog 紧凑化清单

参考标准：主动学习页面 PageCard 紧凑风格
- DialogContent: max-w-sm p-3 gap-1.5 (小型) / max-w-lg p-3 gap-1.5 (中型含表格)
- DialogHeader: gap-0.5 pb-0
- DialogTitle: text-sm
- DialogDescription: text-[10px]
- form/content: space-y-1.5
- Label: text-[10px] text-muted-foreground
- Input: h-7 text-xs
- SelectTrigger: h-7 text-xs
- Button: size="sm" h-7 text-xs
- DialogFooter: pt-1

## 最近开发的页面（需要修改）

- [x] CognitiveDashboard.tsx — TriggerSessionDialog (已修改)
- [ ] BPAConfigManager.tsx — ConfigEditorDialog (max-w-3xl → max-w-lg p-3)
- [x] BPAConfigManager.tsx — RuleEditorDialog (已修改)
- [ ] DimensionManager.tsx — DimensionEditDialog (max-w-lg → max-w-sm p-3)
- [ ] DigitalTwinView.tsx — 2个 Dialog (max-w-lg, max-w-md)
- [ ] KnowledgeExplorer.tsx — 3个 Dialog (max-w-lg x2, max-w-md)
- [ ] PerceptionMonitor.tsx — 2个 Dialog (max-w-lg, max-w-md)
- [ ] GuardrailConsole.tsx — 1个 Dialog (max-w-2xl)
