import { useState, useRef, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';
import { 
  RefreshCw, Plus, Download, Search, Play, Pause, 
  Trash2, Settings, HardDrive, Cpu, Zap, MessageSquare,
  Send, Bot, User, Loader2, Star, Check, X, RotateCcw,
  ChevronRight, Clock, Activity, Sparkles
} from 'lucide-react';
import { useToast } from '@/components/common/Toast';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  tokens?: number;
  latency?: number;
}

export default function ModelCenter() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('models');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  
  // 模型管理状态
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [newModelName, setNewModelName] = useState('');
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  
  // 对话状态
  const [selectedChatModel, setSelectedChatModel] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // 模型配置状态
  const [modelConfig, setModelConfig] = useState({
    temperature: 0.7,
    maxTokens: 4096,
    topP: 0.9,
    topK: 40,
    systemPrompt: '',
  });

  // tRPC 查询
  const { data: ollamaStatus, refetch: refetchStatus } = trpc.model.getOllamaStatus.useQuery();
  const { data: modelList, refetch: refetchModels } = trpc.model.listModels.useQuery({
    type: filterType === 'all' ? 'all' : filterType as any,
    status: filterStatus === 'all' ? 'all' : filterStatus as any,
    search: searchQuery || undefined,
  });
  const { data: usageStats } = trpc.model.getUsageStats.useQuery();
  const { data: conversations, refetch: refetchConversations } = trpc.model.listConversations.useQuery();

  // tRPC mutations
  const syncModelsMutation = trpc.model.syncOllamaModels.useMutation({
    onSuccess: (data) => {
      toast.success(`同步完成，新增 ${data.syncCount} 个模型`);
      refetchModels();
    },
    onError: () => {
      toast.error('同步失败');
    },
  });

  const pullModelMutation = trpc.model.pullModel.useMutation({
    onSuccess: () => {
      toast.success('开始下载模型');
      setShowAddDialog(false);
      setNewModelName('');
      refetchModels();
    },
    onError: () => {
      toast.error('下载失败');
    },
  });

  const deleteModelMutation = trpc.model.deleteModel.useMutation({
    onSuccess: () => {
      toast.success('模型已删除');
      refetchModels();
    },
    onError: () => {
      toast.error('删除失败');
    },
  });

  const setDefaultModelMutation = trpc.model.setDefaultModel.useMutation({
    onSuccess: () => {
      toast.success('已设为默认模型');
      refetchModels();
    },
  });

  const updateConfigMutation = trpc.model.updateModelConfig.useMutation({
    onSuccess: () => {
      toast.success('配置已保存');
      setShowConfigDialog(false);
      refetchModels();
    },
  });

  const createConversationMutation = trpc.model.createConversation.useMutation({
    onSuccess: (data) => {
      setConversationId(data.conversationId);
      setMessages([]);
      refetchConversations();
    },
  });

  // [P2-M1 修复] 使用 tempId 精准匹配删除临时消息，避免并发发送时 slice(0,-1) 误删错误消息
  const lastTempIdRef = useRef<string>('');
  const sendMessageMutation = trpc.model.sendMessage.useMutation({
    onSuccess: (data) => {
      const tempId = lastTempIdRef.current;
      setMessages(prev => [
        ...prev.filter(m => m.id !== tempId), // 精准移除对应的临时消息
        {
          id: data.userMessage.messageId,
          role: 'user',
          content: data.userMessage.content,
          timestamp: new Date(),
        },
        {
          id: data.assistantMessage.messageId,
          role: 'assistant',
          content: data.assistantMessage.content,
          timestamp: new Date(),
          tokens: data.assistantMessage.tokens,
          latency: data.assistantMessage.latency,
        },
      ]);
      setIsSending(false);
    },
    onError: () => {
      toast.error('发送失败');
      const tempId = lastTempIdRef.current;
      setMessages(prev => prev.filter(m => m.id !== tempId)); // [P2-M1] 精准移除对应的临时消息
      setIsSending(false);
    },
  });

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 过滤模型
  const filteredModels = modelList || [];

  // 统计数据
  const stats = {
    total: filteredModels.length,
    loaded: (filteredModels || []).filter(m => m.status === 'loaded').length,
    llmCount: (filteredModels || []).filter(m => m.type === 'llm').length,
    embeddingCount: (filteredModels || []).filter(m => m.type === 'embedding').length,
  };

  // 发送消息
  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !selectedChatModel || isSending) return;

    let currentConversationId = conversationId;

    // 如果没有对话，先创建
    if (!currentConversationId) {
      const result = await createConversationMutation.mutateAsync({
        modelId: selectedChatModel,
        metadata: {
          systemPrompt: modelConfig.systemPrompt || undefined,
          temperature: modelConfig.temperature,
        },
      });
      currentConversationId = result.conversationId;
      setConversationId(currentConversationId);
    }

    // 添加临时用户消息
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    lastTempIdRef.current = tempId; // [P2-M1] 记录当前 tempId 供 mutation 回调精准匹配
    const tempUserMessage: Message = {
      id: tempId,
      role: 'user',
      content: inputMessage,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, tempUserMessage]);
    setInputMessage('');
    setIsSending(true);

    // 发送消息
    sendMessageMutation.mutate({
      conversationId: currentConversationId,
      content: inputMessage,
    });
  };

  // 新建对话
  const handleNewConversation = () => {
    setConversationId(null);
    setMessages([]);
  };

  // 获取类型标签
  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'llm': return { label: '大语言模型', variant: 'info' as const, icon: '🧠' };
      case 'embedding': return { label: '嵌入模型', variant: 'success' as const, icon: '📐' };
      case 'label': return { label: '标注模型', variant: 'warning' as const, icon: '🏷️' };
      case 'diagnostic': return { label: '诊断模型', variant: 'danger' as const, icon: '🔬' };
      case 'vision': return { label: '视觉模型', variant: 'info' as const, icon: '👁️' };
      case 'audio': return { label: '音频模型', variant: 'warning' as const, icon: '🎵' };
      default: return { label: '其他', variant: 'default' as const, icon: '📦' };
    }
  };

  // 打开配置对话框
  const openConfigDialog = (modelId: string) => {
    const model = (filteredModels || []).find(m => m.modelId === modelId);
    if (model) {
      setSelectedModelId(modelId);
      const config = model.config as typeof modelConfig | null;
      setModelConfig({
        temperature: config?.temperature ?? 0.7,
        maxTokens: config?.maxTokens ?? 4096,
        topP: config?.topP ?? 0.9,
        topK: config?.topK ?? 40,
        systemPrompt: config?.systemPrompt ?? '',
      });
      setShowConfigDialog(true);
    }
  };

  // 保存配置
  const saveConfig = () => {
    if (selectedModelId) {
      updateConfigMutation.mutate({
        modelId: selectedModelId,
        config: modelConfig,
      });
    }
  };

  return (
    <MainLayout title="模型中心">
      <div className="animate-fade-up">
        {/* Page header */}
        <div className="flex justify-between items-start mb-7">
          <div>
            <h2 className="text-2xl font-bold mb-2">🤖 模型中心</h2>
            <p className="text-muted-foreground">管理和使用 AI 模型</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary rounded-lg text-sm">
              <span className={cn(
                "w-2 h-2 rounded-full",
                ollamaStatus?.online ? "bg-success" : "bg-destructive"
              )} />
              <span>Ollama {ollamaStatus?.online ? '在线' : '离线'}</span>
            </div>
            <Button variant="secondary" size="sm" onClick={async () => {
              refetchStatus();
              try {
                await syncModelsMutation.mutateAsync();
              } catch (e) {
                // sync may fail if ollama is offline, still refetch db models
              }
              refetchModels();
            }}>
              <RefreshCw className="w-4 h-4 mr-2" />
              刷新
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
          <StatCard value={stats.total} label="模型总数" icon="📦" />
          <StatCard value={stats.loaded} label="已加载" icon="✅" />
          <StatCard value={usageStats?.totalRequests || 0} label="总请求数" icon="📊" />
          <StatCard value={`${Math.round((usageStats?.avgLatency || 0) / 1000)}s`} label="平均延迟" icon="⚡" />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
          <TabsList className="grid w-full grid-cols-3 lg:w-[400px]">
            <TabsTrigger value="models" className="flex items-center gap-2">
              <HardDrive className="w-4 h-4" />
              模型管理
            </TabsTrigger>
            <TabsTrigger value="chat" className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              模型对话
            </TabsTrigger>
            <TabsTrigger value="stats" className="flex items-center gap-2">
              <Activity className="w-4 h-4" />
              使用统计
            </TabsTrigger>
          </TabsList>

          {/* 模型管理 Tab */}
          <TabsContent value="models" className="space-y-5">
            {/* Search and filter */}
            <PageCard>
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[200px] relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="搜索模型..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="全部类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部类型</SelectItem>
                    <SelectItem value="llm">大语言模型</SelectItem>
                    <SelectItem value="embedding">嵌入模型</SelectItem>
                    <SelectItem value="label">标注模型</SelectItem>
                    <SelectItem value="diagnostic">诊断模型</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="全部状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部状态</SelectItem>
                    <SelectItem value="loaded">已加载</SelectItem>
                    <SelectItem value="available">可用</SelectItem>
                    <SelectItem value="downloading">下载中</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="secondary" onClick={() => syncModelsMutation.mutate()}>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  同步 Ollama
                </Button>
                <Button onClick={() => setShowAddDialog(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  添加模型
                </Button>
              </div>
            </PageCard>

            {/* Model list */}
            <PageCard title="模型列表" icon="📋">
              <div className="space-y-3">
                {filteredModels.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <HardDrive className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>没有找到匹配的模型</p>
                    <p className="text-sm mt-2">点击"同步 Ollama"从本地 Ollama 导入模型</p>
                  </div>
                ) : (
                  (filteredModels || []).map((model) => {
                    const typeInfo = getTypeLabel(model.type);
                    return (
                      <div 
                        key={model.modelId}
                        className="flex items-center justify-between p-4 bg-secondary/50 rounded-xl hover:bg-secondary transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "w-12 h-12 rounded-xl flex items-center justify-center text-2xl",
                            model.status === 'loaded' ? "bg-success/20" : "bg-secondary"
                          )}>
                            {typeInfo.icon}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{model.displayName || model.name}</span>
                              <Badge variant={typeInfo.variant}>{typeInfo.label}</Badge>
                              {model.status === 'loaded' && (
                                <Badge variant="success">已加载</Badge>
                              )}
                              {model.isDefault && (
                                <Badge variant="warning">
                                  <Star className="w-3 h-3 mr-1" />
                                  默认
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground mt-1">
                              {model.description || '暂无描述'}
                            </div>
                            <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                              {model.size && (
                                <span className="flex items-center gap-1">
                                  <HardDrive className="w-3 h-3" />
                                  {model.size}
                                </span>
                              )}
                              {model.parameters && (
                                <span className="flex items-center gap-1">
                                  <Cpu className="w-3 h-3" />
                                  {model.parameters}
                                </span>
                              )}
                              {model.quantization && (
                                <span className="flex items-center gap-1">
                                  <Zap className="w-3 h-3" />
                                  {model.quantization}
                                </span>
                              )}
                            </div>
                            {model.status === 'downloading' && model.downloadProgress !== undefined && (
                              <div className="mt-2 w-48">
                                <div className="h-2 bg-background rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-primary transition-all"
                                    style={{ width: `${model.downloadProgress}%` }}
                                  />
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                  下载中 {model.downloadProgress}%
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {model.type === 'llm' && model.status === 'loaded' && (
                            <Button 
                              variant="secondary" 
                              size="sm"
                              onClick={() => {
                                setSelectedChatModel(model.modelId);
                                setActiveTab('chat');
                              }}
                            >
                              <MessageSquare className="w-4 h-4 mr-1" />
                              对话
                            </Button>
                          )}
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => openConfigDialog(model.modelId)}
                          >
                            <Settings className="w-4 h-4" />
                          </Button>
                          {!model.isDefault && model.type === 'llm' && (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setDefaultModelMutation.mutate({ modelId: model.modelId })}
                            >
                              <Star className="w-4 h-4" />
                            </Button>
                          )}
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => {
                              if (confirm(`确定要删除模型 ${model.name} 吗？`)) {
                                deleteModelMutation.mutate({ modelId: model.modelId });
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </PageCard>
          </TabsContent>

          {/* 模型对话 Tab */}
          <TabsContent value="chat" className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
              {/* 对话列表 */}
              <div className="lg:col-span-1">
                <PageCard title="对话列表" icon="💬" className="h-[600px] flex flex-col">
                  <div className="mb-4">
                    <Select value={selectedChatModel} onValueChange={setSelectedChatModel}>
                      <SelectTrigger>
                        <SelectValue placeholder="选择模型" />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredModels
                          .filter(m => m.type === 'llm' && m.status === 'loaded')
                          .map(m => (
                            <SelectItem key={m.modelId} value={m.modelId}>
                              {m.displayName || m.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button 
                    className="w-full mb-4" 
                    onClick={handleNewConversation}
                    disabled={!selectedChatModel}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    新建对话
                  </Button>
                  <div className="flex-1 overflow-y-auto space-y-2">
                    {conversations?.map(conv => (
                      <div
                        key={conv.conversationId}
                        className={cn(
                          "p-3 rounded-lg cursor-pointer transition-colors",
                          conversationId === conv.conversationId
                            ? "bg-primary/20 border border-primary/30"
                            : "bg-secondary/50 hover:bg-secondary"
                        )}
                        onClick={() => {
                          setConversationId(conv.conversationId);
                          setSelectedChatModel(conv.modelId);
                          // TODO: 加载历史消息
                        }}
                      >
                        <div className="font-medium text-sm truncate">{conv.title}</div>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                          <Clock className="w-3 h-3" />
                          {new Date(conv.updatedAt!).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                    {(!conversations || conversations.length === 0) && (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        暂无对话记录
                      </div>
                    )}
                  </div>
                </PageCard>
              </div>

              {/* 对话区域 */}
              <div className="lg:col-span-3">
                <PageCard className="h-[600px] flex flex-col">
                  {/* 消息列表 */}
                  <div className="flex-1 overflow-y-auto space-y-4 mb-4">
                    {messages.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-muted-foreground">
                        <div className="text-center">
                          <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-50" />
                          <p>选择模型开始对话</p>
                          <p className="text-sm mt-2">支持多轮对话、上下文记忆</p>
                        </div>
                      </div>
                    ) : (
                      (messages || []).map((msg) => (
                        <div
                          key={msg.id}
                          className={cn(
                            "flex gap-3",
                            msg.role === 'user' ? "justify-end" : "justify-start"
                          )}
                        >
                          {msg.role === 'assistant' && (
                            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                              <Bot className="w-4 h-4 text-primary" />
                            </div>
                          )}
                          <div
                            className={cn(
                              "max-w-[70%] rounded-2xl px-4 py-3",
                              msg.role === 'user'
                                ? "bg-primary text-primary-foreground"
                                : "bg-secondary"
                            )}
                          >
                            <div className="whitespace-pre-wrap">{msg.content}</div>
                            {msg.role === 'assistant' && (msg.tokens || msg.latency) && (
                              <div className="text-xs opacity-60 mt-2 flex items-center gap-2">
                                {msg.tokens && <span>{msg.tokens} tokens</span>}
                                {msg.latency && <span>{(msg.latency / 1000).toFixed(1)}s</span>}
                              </div>
                            )}
                          </div>
                          {msg.role === 'user' && (
                            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                              <User className="w-4 h-4" />
                            </div>
                          )}
                        </div>
                      ))
                    )}
                    {isSending && (
                      <div className="flex gap-3 justify-start">
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                          <Bot className="w-4 h-4 text-primary" />
                        </div>
                        <div className="bg-secondary rounded-2xl px-4 py-3">
                          <Loader2 className="w-5 h-5 animate-spin" />
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* 输入区域 */}
                  <div className="flex gap-3">
                    <Textarea
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      placeholder={selectedChatModel ? "输入消息..." : "请先选择模型"}
                      className="min-h-[60px] max-h-[120px] resize-none"
                      disabled={!selectedChatModel || isSending}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                    />
                    <Button 
                      className="h-auto"
                      onClick={handleSendMessage}
                      disabled={!selectedChatModel || !inputMessage.trim() || isSending}
                    >
                      <Send className="w-5 h-5" />
                    </Button>
                  </div>
                </PageCard>
              </div>
            </div>
          </TabsContent>

          {/* 使用统计 Tab */}
          <TabsContent value="stats" className="space-y-5">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
              <StatCard 
                value={usageStats?.totalRequests || 0} 
                label="总请求数" 
                icon="📊" 
              />
              <StatCard 
                value={`${((usageStats?.totalInputTokens || 0) / 1000).toFixed(1)}K`} 
                label="输入 Tokens" 
                icon="📥" 
              />
              <StatCard 
                value={`${((usageStats?.totalOutputTokens || 0) / 1000).toFixed(1)}K`} 
                label="输出 Tokens" 
                icon="📤" 
              />
              <StatCard 
                value={`${usageStats?.successRate?.toFixed(1) || 0}%`} 
                label="成功率" 
                icon="✅" 
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <PageCard title="对话统计" icon="💬">
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-3 bg-secondary/50 rounded-lg">
                    <span>总对话数</span>
                    <span className="font-bold">{usageStats?.totalConversations || 0}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-secondary/50 rounded-lg">
                    <span>总消息数</span>
                    <span className="font-bold">{usageStats?.totalMessages || 0}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-secondary/50 rounded-lg">
                    <span>平均延迟</span>
                    <span className="font-bold">{((usageStats?.avgLatency || 0) / 1000).toFixed(2)}s</span>
                  </div>
                </div>
              </PageCard>

              <PageCard title="模型使用分布" icon="📈">
                <div className="space-y-4">
                  {(filteredModels || []).filter(m => m.type === 'llm').slice(0, 5).map(model => (
                    <div key={model.modelId} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-lg">
                        🧠
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium">{model.displayName || model.name}</div>
                        <div className="h-2 bg-secondary rounded-full mt-1 overflow-hidden">
                          <div 
                            className="h-full bg-primary"
                            style={{ width: `${Math.random() * 80 + 20}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </PageCard>
            </div>
          </TabsContent>
        </Tabs>

        {/* 添加模型对话框 */}
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>添加模型</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>模型名称</Label>
                <Input
                  value={newModelName}
                  onChange={(e) => setNewModelName(e.target.value)}
                  placeholder="例如: llama3.1:8b, qwen2:7b"
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  输入 Ollama 模型名称，将自动从 Ollama 仓库下载
                </p>
              </div>
              <div className="bg-secondary/50 rounded-lg p-4">
                <h4 className="font-medium mb-2">推荐模型</h4>
                <div className="grid grid-cols-2 gap-2">
                  {['llama3.1:8b', 'qwen2.5:7b', 'mistral:7b', 'codellama:7b'].map(name => (
                    <Button
                      key={name}
                      variant="outline"
                      size="sm"
                      className="justify-start"
                      onClick={() => setNewModelName(name)}
                    >
                      <ChevronRight className="w-3 h-3 mr-1" />
                      {name}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setShowAddDialog(false)}>
                取消
              </Button>
              <Button 
                onClick={() => pullModelMutation.mutate({ modelName: newModelName })}
                disabled={!newModelName.trim()}
              >
                <Download className="w-4 h-4 mr-2" />
                开始下载
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 模型配置对话框 */}
        <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>模型配置</DialogTitle>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div>
                <div className="flex justify-between mb-2">
                  <Label>Temperature</Label>
                  <span className="text-sm text-muted-foreground">{modelConfig.temperature}</span>
                </div>
                <Slider
                  value={[modelConfig.temperature]}
                  onValueChange={([v]) => setModelConfig(prev => ({ ...prev, temperature: v }))}
                  min={0}
                  max={2}
                  step={0.1}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  控制输出的随机性，值越高输出越多样
                </p>
              </div>

              <div>
                <div className="flex justify-between mb-2">
                  <Label>Max Tokens</Label>
                  <span className="text-sm text-muted-foreground">{modelConfig.maxTokens}</span>
                </div>
                <Slider
                  value={[modelConfig.maxTokens]}
                  onValueChange={([v]) => setModelConfig(prev => ({ ...prev, maxTokens: v }))}
                  min={256}
                  max={32768}
                  step={256}
                />
              </div>

              <div>
                <div className="flex justify-between mb-2">
                  <Label>Top P</Label>
                  <span className="text-sm text-muted-foreground">{modelConfig.topP}</span>
                </div>
                <Slider
                  value={[modelConfig.topP]}
                  onValueChange={([v]) => setModelConfig(prev => ({ ...prev, topP: v }))}
                  min={0}
                  max={1}
                  step={0.05}
                />
              </div>

              <div>
                <Label>系统提示词</Label>
                <Textarea
                  value={modelConfig.systemPrompt}
                  onChange={(e) => setModelConfig(prev => ({ ...prev, systemPrompt: e.target.value }))}
                  placeholder="设置模型的角色和行为..."
                  className="mt-2 min-h-[100px]"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setShowConfigDialog(false)}>
                取消
              </Button>
              <Button onClick={saveConfig}>
                <Check className="w-4 h-4 mr-2" />
                保存配置
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
