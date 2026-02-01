import { useState, useEffect, useRef } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/components/common/Toast';
import { nanoid } from 'nanoid';
import { Send, Loader2, Bot, User, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import * as ollama from '@/services/ollama';

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

export default function AIChat() {
  const toast = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [models, setModels] = useState<OllamaModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState('qwen2.5:7b');
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 检查 Ollama 状态并获取模型列表
  useEffect(() => {
    checkOllamaAndLoadModels();
  }, []);

  // 自动滚动到底部
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
        
        // 如果当前选择的模型不在列表中，选择第一个
        if (formattedModels.length > 0 && !formattedModels.find(m => m.name === selectedModel)) {
          setSelectedModel(formattedModels[0].name);
        }
        
        toast.success(`Ollama 已连接，发现 ${formattedModels.length} 个模型`);
      } else {
        setOllamaStatus('offline');
        toast.error('无法连接到 Ollama 服务');
      }
    } catch (error) {
      setOllamaStatus('offline');
      toast.error('Ollama 连接失败');
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
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
        .map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content
        }));
      
      // 添加系统提示
      const systemPrompt: ollama.ChatMessage = {
        role: 'system',
        content: `你是西联智能平台的 AI 诊断助手，专注于工业设备故障诊断、振动分析、预测性维护等领域。
你的职责包括：
1. 分析设备故障特征和原因
2. 解读振动频谱数据
3. 提供维护和保养建议
4. 进行故障预测分析
5. 回答工业设备相关问题

请用专业但易懂的语言回答用户问题，必要时提供具体的数据分析和建议。`
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
      console.error('Chat error:', error);
      setMessages(prev => prev.map(m => 
        m.id === aiMessageId 
          ? { 
              ...m, 
              content: '抱歉，请求处理失败。请检查 Ollama 服务是否正常运行。',
              isStreaming: false 
            }
          : m
      ));
      toast.error('对话请求失败');
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
    setInput(prompt);
  };

  const clearHistory = () => {
    setMessages([]);
    toast.info('对话历史已清空');
  };

  return (
    <MainLayout title="AI 对话">
      <div className="animate-fade-up">
        {/* Page header */}
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold mb-1">AI 对话</h2>
              <p className="text-xs text-muted-foreground">与本地大模型进行智能对话分析</p>
            </div>
            <div className="flex items-center gap-2">
              {/* Ollama 状态指示器 */}
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
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 text-[10px]"
                onClick={checkOllamaAndLoadModels}
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                刷新
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Chat area */}
          <div className="lg:col-span-2">
            <PageCard
              title="AI 助手"
              icon={<Bot className="w-4 h-4" />}
              action={
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger className="w-[140px] h-7 text-[10px]">
                    <SelectValue placeholder="选择模型" />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((model) => (
                      <SelectItem key={model.name} value={model.name} className="text-[10px]">
                        {model.name} ({model.parameterSize})
                      </SelectItem>
                    ))}
                    {models.length === 0 && (
                      <SelectItem value="none" disabled className="text-[10px]">
                        无可用模型
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              }
            >
              {/* Messages */}
              <ScrollArea className="h-[400px] pr-3" ref={scrollRef}>
                <div className="space-y-3">
                  {messages.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      <Bot className="w-10 h-10 mx-auto mb-3 opacity-50" />
                      <p className="text-xs">您好！我是 AI 诊断助手</p>
                      <p className="text-[10px] mt-1">有什么可以帮您？</p>
                    </div>
                  )}
                  
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {message.role === 'assistant' && (
                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Bot className="w-3.5 h-3.5 text-primary" />
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
                  placeholder={ollamaStatus === 'online' ? "输入问题..." : "请先连接 Ollama..."}
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
            </PageCard>
          </div>

          {/* Sidebar */}
          <div className="space-y-3">
            <PageCard title="快捷提示" icon={<span>💡</span>}>
              <div className="space-y-1.5">
                {[
                  '分析轴承故障特征频率',
                  '解读 FFT 频谱数据',
                  '设备预防性维护建议',
                  '振动数据异常分析',
                  '齿轮箱故障诊断方法',
                  '电机轴承温度过高原因'
                ].map((prompt, i) => (
                  <div
                    key={i}
                    onClick={() => handleQuickPrompt(prompt)}
                    className="p-2 bg-secondary rounded cursor-pointer hover:bg-accent transition-colors text-[10px]"
                  >
                    {prompt}
                  </div>
                ))}
              </div>
            </PageCard>

            <PageCard title="模型信息" icon={<span>🤖</span>}>
              {models.length > 0 ? (
                <div className="space-y-2">
                  {models.map((model) => (
                    <div 
                      key={model.name}
                      className={`p-2 rounded text-[10px] ${
                        model.name === selectedModel 
                          ? 'bg-primary/10 border border-primary/30' 
                          : 'bg-secondary'
                      }`}
                    >
                      <div className="font-medium">{model.name}</div>
                      <div className="text-muted-foreground mt-0.5">
                        {model.parameterSize} · {ollama.formatModelSize(model.size)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-muted-foreground text-[10px]">
                  {ollamaStatus === 'offline' ? '请先连接 Ollama' : '加载中...'}
                </div>
              )}
            </PageCard>

            <PageCard title="操作" icon={<span>⚙️</span>}>
              <div className="space-y-1.5">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full h-7 text-[10px]"
                  onClick={clearHistory}
                >
                  清空对话历史
                </Button>
              </div>
            </PageCard>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
