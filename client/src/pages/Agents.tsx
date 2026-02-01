import { useState, useEffect, useRef } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAppStore } from '@/stores/appStore';
import { useToast } from '@/components/common/Toast';
import { cn } from '@/lib/utils';
import { nanoid } from 'nanoid';
import type { Agent } from '@/types';
import * as ollama from '@/services/ollama';
import * as qdrant from '@/services/qdrant';
import { 
  Send, Loader2, Bot, User, Wifi, WifiOff, RefreshCw, 
  Wrench, Zap, Settings2, FileText, Trash2
} from 'lucide-react';

// 智能体系统提示词配置
const AGENT_SYSTEM_PROMPTS: Record<string, string> = {
  bearing: `你是一位资深的轴承诊断专家，拥有20年以上的工业设备维护经验。你的专业领域包括：

1. **轴承故障类型识别**
   - 内圈故障：BPFI（Ball Pass Frequency Inner）特征频率分析
   - 外圈故障：BPFO（Ball Pass Frequency Outer）特征频率分析
   - 滚动体故障：BSF（Ball Spin Frequency）特征频率分析
   - 保持架故障：FTF（Fundamental Train Frequency）特征频率分析

2. **振动信号分析能力**
   - 时域分析：峰值、均方根值、峰峰值、波形因子、峰值因子、脉冲因子
   - 频域分析：FFT频谱、包络谱、倒频谱
   - 时频分析：小波变换、STFT

3. **故障严重程度评估**
   - 早期故障（微弱特征）
   - 中期故障（明显特征）
   - 晚期故障（严重特征，需立即处理）

请根据用户提供的信息，给出专业的诊断分析和维护建议。回答要专业、具体、可操作。`,

  gear: `你是一位齿轮传动系统诊断专家，精通各类齿轮箱故障诊断。你的专业领域包括：

1. **齿轮故障类型**
   - 齿面磨损：均匀磨损、点蚀、剥落
   - 齿轮断裂：疲劳断裂、冲击断裂
   - 齿轮偏心：装配偏心、制造偏心
   - 齿轮啮合问题：侧隙过大/过小、齿形误差

2. **特征频率分析**
   - 齿轮啮合频率（GMF）及其边带
   - 轴转频及其倍频
   - 调制现象分析

3. **齿轮箱整体评估**
   - 润滑状态评估
   - 轴承状态评估
   - 箱体振动评估

请根据用户描述的现象，提供专业的齿轮故障诊断和处理建议。`,

  motor: `你是一位电机诊断专家，精通各类电机的电气和机械故障分析。你的专业领域包括：

1. **电机机械故障**
   - 转子不平衡：静不平衡、动不平衡、耦合不平衡
   - 轴承故障：滚动轴承、滑动轴承
   - 转子偏心：气隙不均匀
   - 松动故障：机械松动、电气松动

2. **电机电气故障**
   - 定子故障：绕组短路、匝间短路、接地故障
   - 转子故障：断条、端环开裂
   - 电源问题：电压不平衡、谐波污染

3. **诊断方法**
   - 振动分析：1X、2X频率成分
   - 电流分析：MCSA（电机电流特征分析）
   - 温度监测：红外热成像

请根据用户提供的电机运行数据，给出专业诊断和维护建议。`,

  pump: `你是一位泵阀系统诊断专家，熟悉各类流体机械故障。你的专业领域包括：

1. **泵类故障**
   - 气蚀现象：入口压力不足、NPSH不满足
   - 密封泄漏：机械密封、填料密封
   - 叶轮故障：磨损、腐蚀、气蚀损伤
   - 轴承故障：润滑不良、过载

2. **阀门故障**
   - 阀门泄漏：内漏、外漏
   - 阀门卡涩：结垢、腐蚀
   - 执行机构故障

3. **系统问题**
   - 管路振动：水锤、脉动
   - 流量异常：堵塞、泄漏
   - 压力异常：系统阻力变化

请根据用户描述的泵阀系统问题，提供专业诊断和解决方案。`,

  general: `你是一位综合机械诊断专家，具备广泛的设备故障诊断能力。你的专业领域包括：

1. **振动诊断**
   - 不平衡、不对中、松动
   - 共振问题
   - 结构振动

2. **设备类型**
   - 旋转机械：风机、压缩机、汽轮机
   - 往复机械：活塞式压缩机、柴油机
   - 输送设备：皮带机、链条输送机

3. **诊断方法**
   - 振动监测
   - 温度监测
   - 油液分析
   - 声学诊断

请根据用户的问题，提供全面的设备诊断分析和维护建议。`,

  data: `你是一位振动数据分析专家，擅长信号处理和特征工程。你的专业领域包括：

1. **信号处理技术**
   - 滤波：低通、高通、带通、带阻
   - 重采样：上采样、下采样
   - 去噪：小波去噪、EMD分解

2. **特征提取**
   - 时域特征：均值、方差、偏度、峰度、波形因子等
   - 频域特征：主频、频带能量、频谱熵
   - 时频特征：小波系数、STFT特征

3. **数据分析**
   - 趋势分析：设备劣化趋势
   - 对比分析：历史数据对比
   - 统计分析：正态性检验、异常检测

请帮助用户分析振动数据，提取有价值的特征信息。`
};

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

interface OllamaModelInfo {
  name: string;
  size: number;
  parameterSize: string;
}

export default function Agents() {
  const { agents, currentAgent, selectAgent } = useAppStore();
  const toast = useToast();
  
  // 状态
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [models, setModels] = useState<OllamaModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState('qwen2.5:7b');
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [qdrantStatus, setQdrantStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [enableRAG, setEnableRAG] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 检查 Ollama 和 Qdrant 状态
  useEffect(() => {
    checkOllamaAndLoadModels();
    checkQdrantStatus();
  }, []);

  const checkQdrantStatus = async () => {
    setQdrantStatus('checking');
    try {
      const isOnline = await qdrant.checkQdrantStatus();
      setQdrantStatus(isOnline ? 'online' : 'offline');
    } catch {
      setQdrantStatus('offline');
    }
  };

  // 自动滚动
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const checkOllamaAndLoadModels = async () => {
    setOllamaStatus('checking');
    try {
      const isOnline = await ollama.checkOllamaStatus();
      if (isOnline) {
        setOllamaStatus('online');
        const modelList = await ollama.getModels();
        const formattedModels = modelList.map(m => ({
          name: m.name,
          size: m.size,
          parameterSize: m.details.parameter_size
        }));
        setModels(formattedModels);
        
        if (formattedModels.length > 0 && !formattedModels.find(m => m.name === selectedModel)) {
          setSelectedModel(formattedModels[0].name);
        }
      } else {
        setOllamaStatus('offline');
      }
    } catch (error) {
      setOllamaStatus('offline');
    }
  };

  const handleSelectAgent = (agent: Agent) => {
    selectAgent(agent);
    // 清空消息并添加欢迎消息
    setMessages([{
      id: nanoid(),
      role: 'assistant',
      content: `您好！我是**${agent.name}**，${agent.description}。

我可以帮助您：
- 分析设备振动数据和故障特征
- 识别故障类型和严重程度
- 提供维护建议和解决方案

请描述您遇到的问题，或提供相关的监测数据。`,
      timestamp: new Date()
    }]);
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading || !currentAgent) return;
    if (ollamaStatus !== 'online') {
      toast.error('Ollama 服务未连接，请先启动 Ollama');
      return;
    }

    const userMessage: Message = {
      id: nanoid(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // 创建 AI 消息占位
    const aiMessageId = nanoid();
    const aiMessage: Message = {
      id: aiMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true
    };
    setMessages(prev => [...prev, aiMessage]);

    try {
      // 构建对话历史
      const chatHistory: ollama.ChatMessage[] = messages
        .filter(m => m.role !== 'system')
        .slice(-10) // 保留最近10条消息
        .map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content
        }));
      
      // 获取智能体专属系统提示词
      let systemContent = AGENT_SYSTEM_PROMPTS[currentAgent.id] || AGENT_SYSTEM_PROMPTS.general;
      
      // RAG 检索增强
      let ragContext = '';
      if (enableRAG && qdrantStatus === 'online') {
        try {
          ragContext = await qdrant.ragSearch(userMessage.content);
          if (ragContext) {
            systemContent += `\n\n---\n以下是与用户问题相关的参考资料，请结合这些信息进行诊断分析：\n\n${ragContext}`;
          }
        } catch (error) {
          console.warn('RAG 检索失败:', error);
        }
      }
      
      const systemPrompt: ollama.ChatMessage = {
        role: 'system',
        content: systemContent
      };

      // 添加当前用户消息
      chatHistory.push({
        role: 'user',
        content: userMessage.content
      });

      // 调用 Ollama API（流式）
      await ollama.chat(
        selectedModel,
        [systemPrompt, ...chatHistory],
        (chunk) => {
          setMessages(prev => prev.map(m => 
            m.id === aiMessageId 
              ? { ...m, content: m.content + chunk }
              : m
          ));
        }
      );

      // 标记流式传输完成
      setMessages(prev => prev.map(m => 
        m.id === aiMessageId 
          ? { ...m, isStreaming: false }
          : m
      ));

    } catch (error) {
      console.error('Agent chat error:', error);
      setMessages(prev => prev.map(m => 
        m.id === aiMessageId 
          ? { 
              ...m, 
              content: '抱歉，请求处理失败。请检查 Ollama 服务是否正常运行。',
              isStreaming: false 
            }
          : m
      ));
      toast.error('诊断请求失败');
    }

    setIsLoading(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickPrompt = (prompt: string) => {
    if (!currentAgent) {
      toast.warning('请先选择一个智能体');
      return;
    }
    setInput(prompt);
  };

  const clearHistory = () => {
    if (currentAgent) {
      setMessages([{
        id: nanoid(),
        role: 'assistant',
        content: `对话已重置。我是**${currentAgent.name}**，请问有什么可以帮您？`,
        timestamp: new Date()
      }]);
      toast.info('对话历史已清空');
    }
  };

  // 根据当前智能体生成快捷提示
  const getQuickPrompts = (): string[] => {
    if (!currentAgent) return [];
    
    const prompts: Record<string, string[]> = {
      bearing: [
        '轴承振动值突然升高，如何判断故障类型？',
        '如何计算轴承特征频率？',
        '包络谱分析中出现 BPFO 特征，说明什么问题？',
        '轴承温度异常升高的可能原因？'
      ],
      gear: [
        '齿轮箱噪音增大，可能是什么原因？',
        '如何识别齿轮啮合频率及其边带？',
        '齿面点蚀的振动特征是什么？',
        '齿轮箱润滑油分析发现金属颗粒，如何处理？'
      ],
      motor: [
        '电机振动1X分量偏高，如何诊断？',
        '电机电流波动大的可能原因？',
        '如何判断电机转子是否存在断条？',
        '电机轴承温度过高如何处理？'
      ],
      pump: [
        '离心泵出现气蚀现象如何处理？',
        '泵的振动值突然升高，可能原因？',
        '机械密封泄漏如何诊断？',
        '泵的流量下降可能是什么问题？'
      ],
      general: [
        '设备振动值超标如何分析？',
        '如何判断设备是否存在不对中？',
        '设备共振问题如何解决？',
        '预测性维护的最佳实践？'
      ],
      data: [
        '如何对振动信号进行滤波处理？',
        '时域特征提取有哪些常用指标？',
        '如何判断数据是否存在异常？',
        'FFT分析的参数如何设置？'
      ]
    };
    
    return prompts[currentAgent.id] || prompts.general;
  };

  return (
    <MainLayout title="智能体诊断">
      <div className="animate-fade-up">
        {/* Page header */}
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold mb-1">智能体诊断</h2>
              <p className="text-xs text-muted-foreground">选择专业智能体进行设备故障诊断分析</p>
            </div>
            <div className="flex items-center gap-2">
              {/* Ollama 状态 */}
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] ${
                ollamaStatus === 'online' 
                  ? 'bg-green-500/10 text-green-600' 
                  : ollamaStatus === 'offline'
                  ? 'bg-red-500/10 text-red-600'
                  : 'bg-yellow-500/10 text-yellow-600'
              }`}>
                {ollamaStatus === 'online' ? (
                  <><Wifi className="w-3 h-3" /> Ollama 已连接</>
                ) : ollamaStatus === 'offline' ? (
                  <><WifiOff className="w-3 h-3" /> Ollama 未连接</>
                ) : (
                  <><Loader2 className="w-3 h-3 animate-spin" /> 检查中...</>
                )}
              </div>
              {/* Qdrant RAG 状态 */}
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] ${
                qdrantStatus === 'online' 
                  ? 'bg-cyan-500/10 text-cyan-600' 
                  : qdrantStatus === 'offline'
                  ? 'bg-gray-500/10 text-gray-500'
                  : 'bg-yellow-500/10 text-yellow-600'
              }`}>
                {qdrantStatus === 'online' ? (
                  <>📚 RAG 已启用</>
                ) : qdrantStatus === 'offline' ? (
                  <>📚 RAG 未连接</>
                ) : (
                  <><Loader2 className="w-3 h-3 animate-spin" /> 检查中...</>
                )}
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 text-[10px]"
                onClick={() => {
                  checkOllamaAndLoadModels();
                  checkQdrantStatus();
                }}
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                刷新
              </Button>
            </div>
          </div>
        </div>

        {/* Agent selection */}
        <PageCard title="六大专家智能体" icon={<Bot className="w-4 h-4" />} className="mb-3">
          <p className="text-[10px] text-muted-foreground mb-3">点击智能体卡片开始专业诊断对话</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {agents.map((agent) => (
              <div
                key={agent.id}
                onClick={() => handleSelectAgent(agent)}
                className={cn(
                  "bg-gradient-to-br from-card to-secondary border rounded-lg p-3 cursor-pointer transition-all duration-300 text-center relative overflow-hidden group",
                  "hover:-translate-y-0.5 hover:border-primary/50",
                  currentAgent?.id === agent.id 
                    ? "border-primary ring-1 ring-primary/30" 
                    : "border-border"
                )}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-transparent to-primary/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative z-10">
                  <div className="text-2xl mb-1.5">{agent.icon}</div>
                  <div className="font-medium text-[11px] mb-1">{agent.name}</div>
                  <div className="text-[9px] text-muted-foreground line-clamp-2">
                    {agent.description.substring(0, 20)}...
                  </div>
                </div>
              </div>
            ))}
          </div>
        </PageCard>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Chat area */}
          <div className="lg:col-span-2">
            <PageCard
              title={currentAgent ? `${currentAgent.icon} ${currentAgent.name}` : '💬 智能体对话'}
              icon=""
              action={
                currentAgent && (
                  <Select value={selectedModel} onValueChange={setSelectedModel}>
                    <SelectTrigger className="w-[130px] h-7 text-[10px]">
                      <SelectValue placeholder="选择模型" />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map((model) => (
                        <SelectItem key={model.name} value={model.name} className="text-[10px]">
                          {model.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              }
            >
              {currentAgent ? (
                <>
                  {/* Messages */}
                  <ScrollArea className="h-[350px] pr-3" ref={scrollRef}>
                    <div className="space-y-3">
                      {messages.map((message) => (
                        <div
                          key={message.id}
                          className={`flex gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          {message.role === 'assistant' && (
                            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <span className="text-sm">{currentAgent.icon}</span>
                            </div>
                          )}
                          <div
                            className={`max-w-[80%] rounded-lg px-3 py-2 text-xs ${
                              message.role === 'user'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-secondary'
                            }`}
                          >
                            <div className="whitespace-pre-wrap break-words">
                              {message.content}
                              {message.isStreaming && (
                                <span className="inline-block w-1.5 h-3 bg-current ml-0.5 animate-pulse" />
                              )}
                            </div>
                          </div>
                          {message.role === 'user' && (
                            <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                              <User className="w-3.5 h-3.5 text-primary-foreground" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>

                  {/* Input */}
                  <div className="flex gap-2 mt-3 pt-3 border-t">
                    <Input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder={ollamaStatus === 'online' ? `向${currentAgent.name}提问...` : "请先连接 Ollama..."}
                      disabled={isLoading || ollamaStatus !== 'online'}
                      className="h-8 text-xs"
                    />
                    <Button 
                      onClick={handleSend} 
                      disabled={isLoading || !input.trim() || ollamaStatus !== 'online'}
                      size="sm"
                      className="h-8 px-3"
                    >
                      {isLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Bot className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">请先点击上方选择一个智能体开始对话</p>
                  <p className="text-[10px] mt-1">每个智能体都有专业的诊断能力</p>
                </div>
              )}
            </PageCard>
          </div>

          {/* Sidebar */}
          <div className="space-y-3">
            {/* Quick prompts */}
            <PageCard title="快捷提问" icon={<Zap className="w-4 h-4" />}>
              {currentAgent ? (
                <div className="space-y-1.5">
                  {getQuickPrompts().map((prompt, i) => (
                    <div
                      key={i}
                      onClick={() => handleQuickPrompt(prompt)}
                      className="p-2 bg-secondary rounded cursor-pointer hover:bg-accent transition-colors text-[10px] line-clamp-2"
                    >
                      {prompt}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-muted-foreground text-[10px]">
                  请先选择智能体
                </div>
              )}
            </PageCard>

            {/* Agent info */}
            {currentAgent && (
              <PageCard title="智能体信息" icon={<Settings2 className="w-4 h-4" />}>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-2 bg-secondary rounded">
                    <span className="text-xl">{currentAgent.icon}</span>
                    <div>
                      <div className="font-medium text-[11px]">{currentAgent.name}</div>
                      <div className="text-[9px] text-muted-foreground">{currentAgent.description}</div>
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    <div className="flex justify-between py-1 border-b border-border/50">
                      <span>当前模型</span>
                      <span className="font-medium text-foreground">{selectedModel}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-border/50">
                      <span>对话轮数</span>
                      <span className="font-medium text-foreground">{Math.floor(messages.length / 2)}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-border/50">
                      <span>连接状态</span>
                      <Badge variant={ollamaStatus === 'online' ? 'success' : 'danger'} className="text-[9px]">
                        {ollamaStatus === 'online' ? '已连接' : '未连接'}
                      </Badge>
                    </div>
                    <div className="flex justify-between py-1">
                      <span>RAG 增强</span>
                      <Badge variant={qdrantStatus === 'online' && enableRAG ? 'info' : 'default'} className="text-[9px]">
                        {qdrantStatus === 'online' && enableRAG ? '已启用' : '未启用'}
                      </Badge>
                    </div>
                  </div>
                </div>
              </PageCard>
            )}

            {/* Actions */}
            <PageCard title="操作" icon={<Wrench className="w-4 h-4" />}>
              <div className="space-y-1.5">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full h-7 text-[10px]"
                  onClick={clearHistory}
                  disabled={!currentAgent}
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  清空对话
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full h-7 text-[10px]"
                  onClick={() => {
                    if (messages.length > 0) {
                      const content = messages.map(m => 
                        `[${m.role === 'user' ? '用户' : '智能体'}] ${m.content}`
                      ).join('\n\n');
                      const blob = new Blob([content], { type: 'text/plain' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `诊断对话-${currentAgent?.name}-${new Date().toISOString().slice(0, 10)}.txt`;
                      a.click();
                      URL.revokeObjectURL(url);
                      toast.success('对话记录已导出');
                    }
                  }}
                  disabled={!currentAgent || messages.length === 0}
                >
                  <FileText className="w-3 h-3 mr-1" />
                  导出对话
                </Button>
              </div>
            </PageCard>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
