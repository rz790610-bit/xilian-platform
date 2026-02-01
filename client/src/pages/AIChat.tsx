import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { ChatBox } from '@/components/chat/ChatBox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppStore, API_BASE } from '@/stores/appStore';
import { nanoid } from 'nanoid';
import type { ChatMessage } from '@/types';
import axios from 'axios';

export default function AIChat() {
  const { 
    chatMessages, 
    addChatMessage, 
    selectedModel, 
    setSelectedModel,
    models 
  } = useAppStore();
  const [isLoading, setIsLoading] = useState(false);

  const handleSendMessage = async (content: string) => {
    // 添加用户消息
    const userMessage: ChatMessage = {
      id: nanoid(),
      role: 'user',
      content,
      timestamp: new Date()
    };
    addChatMessage(userMessage);

    setIsLoading(true);
    try {
      const response = await axios.post(`${API_BASE}/api/ai/diagnose`, {
        question: content,
        model: selectedModel
      }, { timeout: 600000 });

      const aiMessage: ChatMessage = {
        id: nanoid(),
        role: 'assistant',
        content: response.data.answer || '抱歉，我无法处理您的请求。',
        timestamp: new Date()
      };
      addChatMessage(aiMessage);
    } catch (error) {
      // 模拟响应
      const aiMessage: ChatMessage = {
        id: nanoid(),
        role: 'assistant',
        content: `收到您的问题：${content}\n\n作为 AI 诊断助手，我可以帮助您分析设备故障、解读振动数据、提供维护建议等。请提供更多详细信息，我将为您提供专业的分析。\n\n当前使用模型：${selectedModel}`,
        timestamp: new Date()
      };
      addChatMessage(aiMessage);
    }
    setIsLoading(false);
  };

  // 初始消息
  const displayMessages = chatMessages.length > 0 ? chatMessages : [{
    id: 'welcome',
    role: 'assistant' as const,
    content: '您好！我是 AI 诊断助手，有什么可以帮您？',
    timestamp: new Date()
  }];

  return (
    <MainLayout title="AI 对话">
      <div className="animate-fade-up">
        {/* Page header */}
        <div className="mb-7">
          <h2 className="text-2xl font-bold mb-2">AI 对话</h2>
          <p className="text-muted-foreground">与 AI 助手进行智能对话分析</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Chat area */}
          <div className="lg:col-span-2">
            <PageCard
              title="AI 助手"
              icon="💬"
              action={
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="选择模型" />
                  </SelectTrigger>
                  <SelectContent>
                    {models.filter(m => m.type === 'llm').map((model) => (
                      <SelectItem key={model.id} value={model.name}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              }
            >
              <ChatBox
                messages={displayMessages}
                onSend={handleSendMessage}
                placeholder="输入问题..."
                isLoading={isLoading}
              />
            </PageCard>
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            <PageCard title="快捷提示" icon="💡">
              <div className="space-y-2">
                {[
                  '分析轴承故障特征',
                  '解读频谱数据',
                  '设备维护建议',
                  '故障预测分析'
                ].map((prompt, i) => (
                  <div
                    key={i}
                    onClick={() => handleSendMessage(prompt)}
                    className="p-3 bg-secondary rounded-lg cursor-pointer hover:bg-accent transition-colors text-sm"
                  >
                    {prompt}
                  </div>
                ))}
              </div>
            </PageCard>

            <PageCard title="对话历史" icon="📜">
              <div className="text-center py-6 text-muted-foreground">
                <span className="text-3xl block mb-2">📋</span>
                <p className="text-sm">暂无历史记录</p>
              </div>
            </PageCard>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
