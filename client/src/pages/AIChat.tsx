import { useState, useEffect, useRef, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/common/Toast';
import { nanoid } from 'nanoid';
import { 
  Send, Loader2, Bot, User, Wifi, WifiOff, RefreshCw, 
  MessageSquare, FileText, Search, Upload, Copy, Download,
  Languages, Sparkles, FileEdit, BookOpen, Trash2, ChevronRight
} from 'lucide-react';
import * as ollama from '@/services/ollama';
import * as qdrant from '@/services/qdrant';

// 功能模式类型
type ChatMode = 'chat' | 'document' | 'knowledge';

// 文档操作类型
type DocAction = 'summarize' | 'edit' | 'translate' | 'explain';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  mode?: ChatMode;
  docAction?: DocAction;
}

interface OllamaModelInfo {
  name: string;
  size: number;
  parameterSize: string;
}

// 文档操作配置
const DOC_ACTIONS: { id: DocAction; label: string; icon: React.ReactNode; description: string; prompt: string }[] = [
  { 
    id: 'summarize', 
    label: '文档总结', 
    icon: <Sparkles className="w-4 h-4" />,
    description: '提取文档核心内容，生成简洁摘要',
    prompt: '请对以下文档内容进行总结，提取核心要点，生成简洁的摘要：\n\n'
  },
  { 
    id: 'edit', 
    label: '润色优化', 
    icon: <FileEdit className="w-4 h-4" />,
    description: '优化文档表达，提升文字质量',
    prompt: '请对以下文档内容进行润色优化，改进表达方式，提升文字质量，保持原意不变：\n\n'
  },
  { 
    id: 'translate', 
    label: '翻译', 
    icon: <Languages className="w-4 h-4" />,
    description: '中英文互译，保持专业术语准确',
    prompt: '请将以下内容翻译成目标语言（如果是中文则翻译成英文，如果是英文则翻译成中文），保持专业术语准确：\n\n'
  },
  { 
    id: 'explain', 
    label: '解释说明', 
    icon: <BookOpen className="w-4 h-4" />,
    description: '解释专业术语和复杂概念',
    prompt: '请对以下内容进行详细解释，说明其中的专业术语和复杂概念，使其更容易理解：\n\n'
  }
];

// 模式配置
const MODE_CONFIG = {
  chat: {
    label: '智能对话',
    icon: <MessageSquare className="w-4 h-4" />,
    description: '通用 AI 对话，支持问答、分析、创作',
    systemPrompt: `你是西联智能平台的 AI 助手，具备以下能力：
1. 工业设备故障诊断和振动分析
2. 技术问题解答和方案建议
3. 数据分析和报告生成
4. 通用知识问答和创意写作

请用专业但易懂的语言回答问题，必要时提供具体的数据和建议。`
  },
  document: {
    label: '文档处理',
    icon: <FileText className="w-4 h-4" />,
    description: '文档总结、润色、翻译、解释',
    systemPrompt: `你是专业的文档处理助手，擅长：
1. 文档内容总结和要点提取
2. 文字润色和表达优化
3. 中英文专业翻译
4. 专业术语解释

请根据用户需求处理文档，保持专业性和准确性。`
  },
  knowledge: {
    label: '知识检索',
    icon: <Search className="w-4 h-4" />,
    description: '基于知识库的智能问答',
    systemPrompt: `你是知识库问答助手，基于检索到的相关知识回答问题。
请注意：
1. 优先使用检索到的知识内容回答
2. 如果知识库中没有相关信息，请明确告知
3. 回答要准确、专业、有条理
4. 必要时引用知识来源`
  }
};

export default function AIChat() {
  const toast = useToast();
  
  // 基础状态
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [models, setModels] = useState<OllamaModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState('qwen2.5:7b');
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  
  // 功能模式
  const [mode, setMode] = useState<ChatMode>('chat');
  const [docAction, setDocAction] = useState<DocAction>('summarize');
  const [docContent, setDocContent] = useState('');
  
  // RAG 状态
  const [qdrantStatus, setQdrantStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [knowledgeCollections, setKnowledgeCollections] = useState<string[]>([]);
  const [selectedCollection, setSelectedCollection] = useState('diagnosis_knowledge');
  const [ragEnabled, setRagEnabled] = useState(true);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 检查服务状态
  useEffect(() => {
    checkOllamaAndLoadModels();
    checkQdrantStatus();
  }, []);

  // 自动滚动
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // 根据模式自动选择模型
  useEffect(() => {
    if (models.length > 0) {
      if (mode === 'document') {
        // 文档处理优先使用 Qwen
        const qwenModel = models.find(m => m.name.includes('qwen'));
        if (qwenModel) setSelectedModel(qwenModel.name);
      } else if (mode === 'chat') {
        // 通用对话可以使用 Llama
        const llamaModel = models.find(m => m.name.includes('llama'));
        if (llamaModel) setSelectedModel(llamaModel.name);
      }
    }
  }, [mode, models]);

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

  const checkQdrantStatus = async () => {
    setQdrantStatus('checking');
    try {
      const isOnline = await qdrant.checkQdrantStatus();
      if (isOnline) {
        setQdrantStatus('online');
        const collectionsInfo = await qdrant.getCollections();
        const collections = collectionsInfo.map(c => c.name);
        setKnowledgeCollections(collections);
        if (collections.length > 0 && !collections.includes(selectedCollection)) {
          setSelectedCollection(collections[0]);
        }
      } else {
        setQdrantStatus('offline');
      }
    } catch {
      setQdrantStatus('offline');
    }
  };

  // RAG 检索
  const searchKnowledge = async (query: string): Promise<string> => {
    if (qdrantStatus !== 'online' || !ragEnabled) return '';
    
    try {
      const results = await qdrant.searchKnowledge(selectedCollection, query, 3);
      if (results.length === 0) return '';
      
      const context = results.map((r: qdrant.SearchResult, i: number) => 
        `[知识${i + 1}] ${r.payload.title || ''}:\n${r.payload.content}`
      ).join('\n\n');
      
      return `\n\n【相关知识库内容】\n${context}\n\n请基于以上知识回答用户问题：`;
    } catch {
      return '';
    }
  };

  // 发送消息
  const handleSend = async () => {
    if (isLoading) return;
    
    let userContent = '';
    
    if (mode === 'document') {
      if (!docContent.trim()) {
        toast.error('请输入或上传文档内容');
        return;
      }
      const action = DOC_ACTIONS.find(a => a.id === docAction);
      userContent = (action?.prompt || '') + docContent;
    } else {
      if (!input.trim()) return;
      userContent = input.trim();
    }
    
    if (ollamaStatus !== 'online') {
      toast.error('Ollama 服务未连接，请先启动 Ollama');
      return;
    }

    const userMessage: Message = {
      id: nanoid(),
      role: 'user',
      content: mode === 'document' ? `[${DOC_ACTIONS.find(a => a.id === docAction)?.label}]\n${docContent.substring(0, 200)}${docContent.length > 200 ? '...' : ''}` : userContent,
      timestamp: new Date(),
      mode,
      docAction: mode === 'document' ? docAction : undefined
    };

    setMessages(prev => [...prev, userMessage]);
    if (mode !== 'document') setInput('');
    setIsLoading(true);

    const aiMessageId = nanoid();
    const aiMessage: Message = {
      id: aiMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
      mode
    };
    setMessages(prev => [...prev, aiMessage]);

    try {
      // 构建消息
      const systemPrompt: ollama.ChatMessage = {
        role: 'system',
        content: MODE_CONFIG[mode].systemPrompt
      };

      let contextualPrompt = userContent;
      
      // 知识检索模式添加 RAG 上下文
      if (mode === 'knowledge' && ragEnabled) {
        const ragContext = await searchKnowledge(userContent);
        if (ragContext) {
          contextualPrompt = ragContext + userContent;
        }
      }

      const chatHistory: ollama.ChatMessage[] = messages
        .filter(m => m.role !== 'system' && m.mode === mode)
        .slice(-10) // 保留最近10条
        .map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content
        }));

      chatHistory.push({
        role: 'user',
        content: contextualPrompt
      });

      // 调用 Ollama
      await ollama.chat(
        selectedModel,
        [systemPrompt, ...chatHistory],
        (chunk) => {
          setMessages(prev => prev.map(m => 
            m.id === aiMessageId 
              ? { ...m, content: m.content + chunk }
              : m
          ));
        },
        {
          temperature: mode === 'document' ? 0.3 : 0.7, // 文档处理用更低温度
          num_predict: mode === 'document' ? 4096 : 2048
        }
      );

      setMessages(prev => prev.map(m => 
        m.id === aiMessageId 
          ? { ...m, isStreaming: false }
          : m
      ));

      if (mode === 'document') {
        toast.success('文档处理完成');
      }

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
      toast.error('请求失败');
    }

    setIsLoading(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && mode !== 'document') {
      e.preventDefault();
      handleSend();
    }
  };

  // 文件上传处理
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['text/plain', 'text/markdown', 'application/json'];
    const allowedExtensions = ['.txt', '.md', '.json', '.csv'];
    
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    
    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(ext)) {
      toast.error('仅支持 TXT、MD、JSON、CSV 格式');
      return;
    }

    try {
      const text = await file.text();
      setDocContent(text);
      toast.success(`已加载文件: ${file.name}`);
    } catch {
      toast.error('文件读取失败');
    }
    
    // 清空 input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 复制内容
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('已复制到剪贴板');
  };

  // 导出对话
  const exportChat = () => {
    const content = messages.map(m => 
      `[${m.role === 'user' ? '用户' : 'AI'}] ${m.timestamp.toLocaleString()}\n${m.content}`
    ).join('\n\n---\n\n');
    
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `对话记录_${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('对话已导出');
  };

  const clearHistory = () => {
    setMessages([]);
    toast.info('对话历史已清空');
  };

  // 快捷提示
  const quickPrompts = {
    chat: [
      '分析轴承故障特征频率',
      '解读 FFT 频谱数据',
      '设备预防性维护建议',
      '振动数据异常分析'
    ],
    document: [
      '请帮我总结这份报告的要点',
      '优化这段技术文档的表达',
      '将这段内容翻译成英文'
    ],
    knowledge: [
      '轴承故障的典型特征是什么？',
      '如何判断齿轮磨损程度？',
      '电机振动异常的常见原因'
    ]
  };

  return (
    <MainLayout title="AI 对话">
      <div className="animate-fade-up">
        {/* 页面头部 */}
        <div className="mb-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-lg font-bold mb-1">AI 对话平台</h2>
              <p className="text-xs text-muted-foreground">多模态智能对话，支持文档处理与知识检索</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* 状态指示器 */}
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] ${
                ollamaStatus === 'online' 
                  ? 'bg-green-500/10 text-green-600' 
                  : ollamaStatus === 'offline'
                  ? 'bg-red-500/10 text-red-600'
                  : 'bg-yellow-500/10 text-yellow-600'
              }`}>
                {ollamaStatus === 'online' ? (
                  <><Wifi className="w-3 h-3" /> Ollama</>
                ) : ollamaStatus === 'offline' ? (
                  <><WifiOff className="w-3 h-3" /> Ollama</>
                ) : (
                  <><Loader2 className="w-3 h-3 animate-spin" /> 检查中</>
                )}
              </div>
              
              {mode === 'knowledge' && (
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] ${
                  qdrantStatus === 'online' 
                    ? 'bg-blue-500/10 text-blue-600' 
                    : 'bg-gray-500/10 text-gray-600'
                }`}>
                  <Search className="w-3 h-3" />
                  RAG {qdrantStatus === 'online' ? '已启用' : '未连接'}
                </div>
              )}
              
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 text-[10px]"
                onClick={() => { checkOllamaAndLoadModels(); checkQdrantStatus(); }}
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                刷新
              </Button>
            </div>
          </div>
        </div>

        {/* 模式切换标签 */}
        <Tabs value={mode} onValueChange={(v) => setMode(v as ChatMode)} className="mb-4">
          <TabsList className="grid w-full grid-cols-3 h-9">
            {Object.entries(MODE_CONFIG).map(([key, config]) => (
              <TabsTrigger key={key} value={key} className="text-xs gap-1.5">
                {config.icon}
                {config.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* 主对话区域 */}
          <div className="lg:col-span-2">
            <PageCard
              title={MODE_CONFIG[mode].label}
              icon={MODE_CONFIG[mode].icon}
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
              {/* 文档处理模式 - 特殊输入区 */}
              {mode === 'document' && (
                <div className="mb-3 space-y-3">
                  {/* 操作选择 */}
                  <div className="grid grid-cols-4 gap-2">
                    {DOC_ACTIONS.map((action) => (
                      <button
                        key={action.id}
                        onClick={() => setDocAction(action.id)}
                        className={`p-2 rounded-lg text-center transition-all ${
                          docAction === action.id
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary hover:bg-accent'
                        }`}
                      >
                        <div className="flex justify-center mb-1">{action.icon}</div>
                        <div className="text-[10px] font-medium">{action.label}</div>
                      </button>
                    ))}
                  </div>
                  
                  {/* 文档输入 */}
                  <div className="relative">
                    <Textarea
                      value={docContent}
                      onChange={(e) => setDocContent(e.target.value)}
                      placeholder="粘贴或输入文档内容..."
                      className="min-h-[150px] text-xs resize-none pr-20"
                    />
                    <div className="absolute top-2 right-2 flex flex-col gap-1">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".txt,.md,.json,.csv"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[10px]"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="w-3 h-3 mr-1" />
                        上传
                      </Button>
                      {docContent && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[10px]"
                          onClick={() => setDocContent('')}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  <div className="text-[10px] text-muted-foreground">
                    {DOC_ACTIONS.find(a => a.id === docAction)?.description}
                    {docContent && ` · ${docContent.length} 字符`}
                  </div>
                  
                  <Button 
                    onClick={handleSend} 
                    disabled={isLoading || !docContent.trim() || ollamaStatus !== 'online'}
                    className="w-full"
                  >
                    {isLoading ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> 处理中...</>
                    ) : (
                      <><ChevronRight className="w-4 h-4 mr-2" /> 开始处理</>
                    )}
                  </Button>
                </div>
              )}

              {/* 消息列表 */}
              <ScrollArea className={`pr-3 ${mode === 'document' ? 'h-[250px]' : 'h-[400px]'}`} ref={scrollRef}>
                <div className="space-y-3">
                  {messages.filter(m => mode === 'document' || m.mode === mode || !m.mode).length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      {MODE_CONFIG[mode].icon}
                      <p className="text-xs mt-3">{MODE_CONFIG[mode].description}</p>
                      <p className="text-[10px] mt-1">
                        {mode === 'document' ? '请输入文档内容开始处理' : '输入问题开始对话'}
                      </p>
                    </div>
                  )}
                  
                  {messages
                    .filter(m => mode === 'document' ? m.mode === 'document' : (m.mode === mode || !m.mode))
                    .map((message) => (
                    <div
                      key={message.id}
                      className={`flex gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {message.role === 'assistant' && (
                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Bot className="w-3.5 h-3.5 text-primary" />
                        </div>
                      )}
                      <div className="max-w-[80%] space-y-1">
                        <div
                          className={`rounded-lg px-3 py-2 text-xs ${
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
                        {message.role === 'assistant' && !message.isStreaming && message.content && (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 px-1.5 text-[9px]"
                              onClick={() => copyToClipboard(message.content)}
                            >
                              <Copy className="w-2.5 h-2.5 mr-0.5" />
                              复制
                            </Button>
                          </div>
                        )}
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

              {/* 输入框 - 非文档模式 */}
              {mode !== 'document' && (
                <div className="flex gap-2 mt-3 pt-3 border-t">
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder={
                      ollamaStatus === 'online' 
                        ? (mode === 'knowledge' ? '输入问题，将从知识库检索相关内容...' : '输入问题...')
                        : '请先连接 Ollama...'
                    }
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
              )}
            </PageCard>
          </div>

          {/* 侧边栏 */}
          <div className="space-y-3">
            {/* 快捷提示 */}
            <PageCard title="快捷提示" icon={<span>💡</span>}>
              <div className="space-y-1.5">
                {quickPrompts[mode].map((prompt, i) => (
                  <div
                    key={i}
                    onClick={() => mode === 'document' ? setDocContent(prompt) : setInput(prompt)}
                    className="p-2 bg-secondary rounded cursor-pointer hover:bg-accent transition-colors text-[10px]"
                  >
                    {prompt}
                  </div>
                ))}
              </div>
            </PageCard>

            {/* 知识库选择 - 仅知识检索模式 */}
            {mode === 'knowledge' && (
              <PageCard title="知识库" icon={<Search className="w-4 h-4" />}>
                <div className="space-y-2">
                  <Select value={selectedCollection} onValueChange={setSelectedCollection}>
                    <SelectTrigger className="h-8 text-[10px]">
                      <SelectValue placeholder="选择知识库" />
                    </SelectTrigger>
                    <SelectContent>
                      {knowledgeCollections.map((col) => (
                        <SelectItem key={col} value={col} className="text-[10px]">
                          {col}
                        </SelectItem>
                      ))}
                      {knowledgeCollections.length === 0 && (
                        <SelectItem value="none" disabled className="text-[10px]">
                          无可用知识库
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground">RAG 增强</span>
                    <button
                      onClick={() => setRagEnabled(!ragEnabled)}
                      className={`px-2 py-0.5 rounded ${
                        ragEnabled ? 'bg-primary text-primary-foreground' : 'bg-secondary'
                      }`}
                    >
                      {ragEnabled ? '已启用' : '已禁用'}
                    </button>
                  </div>
                  
                  {qdrantStatus === 'offline' && (
                    <div className="text-[10px] text-yellow-600 bg-yellow-500/10 p-2 rounded">
                      Qdrant 未连接，请先启动向量数据库
                    </div>
                  )}
                </div>
              </PageCard>
            )}

            {/* 模型信息 */}
            <PageCard title="模型信息" icon={<span>🤖</span>}>
              {models.length > 0 ? (
                <div className="space-y-2">
                  {models.map((model) => (
                    <div 
                      key={model.name}
                      onClick={() => setSelectedModel(model.name)}
                      className={`p-2 rounded text-[10px] cursor-pointer transition-colors ${
                        model.name === selectedModel 
                          ? 'bg-primary/10 border border-primary/30' 
                          : 'bg-secondary hover:bg-accent'
                      }`}
                    >
                      <div className="font-medium flex items-center gap-1">
                        {model.name.includes('qwen') && <span>🇨🇳</span>}
                        {model.name.includes('llama') && <span>🦙</span>}
                        {model.name}
                      </div>
                      <div className="text-muted-foreground mt-0.5">
                        {model.parameterSize} · {ollama.formatModelSize(model.size)}
                      </div>
                      <div className="text-[9px] text-muted-foreground mt-0.5">
                        {model.name.includes('qwen') ? '推荐用于中文/文档处理' : '推荐用于通用对话'}
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

            {/* 操作 */}
            <PageCard title="操作" icon={<span>⚙️</span>}>
              <div className="space-y-1.5">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full h-7 text-[10px]"
                  onClick={exportChat}
                  disabled={messages.length === 0}
                >
                  <Download className="w-3 h-3 mr-1" />
                  导出对话
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full h-7 text-[10px]"
                  onClick={clearHistory}
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  清空历史
                </Button>
              </div>
            </PageCard>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
