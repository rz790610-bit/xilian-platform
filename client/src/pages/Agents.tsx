import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { ChatBox } from '@/components/chat/ChatBox';
import { useAppStore, API_BASE } from '@/stores/appStore';
import { cn } from '@/lib/utils';
import { nanoid } from 'nanoid';
import type { Agent, ChatMessage } from '@/types';
import axios from 'axios';

export default function Agents() {
  const { agents, currentAgent, selectAgent, agentMessages, addAgentMessage } = useAppStore();
  const [isLoading, setIsLoading] = useState(false);

  const handleSelectAgent = (agent: Agent) => {
    selectAgent(agent);
    // 添加欢迎消息
    const welcomeMessage: ChatMessage = {
      id: nanoid(),
      role: 'assistant',
      content: `您好！我是${agent.name}，${agent.description}。请问有什么可以帮您？`,
      timestamp: new Date()
    };
    useAppStore.getState().clearAgentMessages();
    addAgentMessage(welcomeMessage);
  };

  const handleSendMessage = async (content: string) => {
    if (!currentAgent) return;

    // 添加用户消息
    const userMessage: ChatMessage = {
      id: nanoid(),
      role: 'user',
      content,
      timestamp: new Date()
    };
    addAgentMessage(userMessage);

    setIsLoading(true);
    try {
      const response = await axios.post(`${API_BASE}/api/agents/${currentAgent.id}/chat`, {
        message: content
      }, { timeout: 120000 });

      const aiMessage: ChatMessage = {
        id: nanoid(),
        role: 'assistant',
        content: response.data.response || '抱歉，我无法处理您的请求。',
        timestamp: new Date()
      };
      addAgentMessage(aiMessage);
    } catch (error) {
      // 模拟响应
      const aiMessage: ChatMessage = {
        id: nanoid(),
        role: 'assistant',
        content: `作为${currentAgent.name}，我来分析您的问题：\n\n${content}\n\n根据我的专业知识，这个问题涉及到设备诊断的核心领域。建议您提供更多的数据信息，如振动频谱、温度趋势等，以便进行更准确的分析。`,
        timestamp: new Date()
      };
      addAgentMessage(aiMessage);
    }
    setIsLoading(false);
  };

  return (
    <MainLayout title="智能体诊断">
      <div className="animate-fade-up">
        {/* Page header */}
        <div className="mb-7">
          <h2 className="text-2xl font-bold mb-2">智能体诊断</h2>
          <p className="text-muted-foreground">选择专业智能体进行故障诊断分析</p>
        </div>

        {/* Agent selection */}
        <PageCard title="六大专家智能体" icon="🤖" className="mb-5">
          <p className="text-sm text-muted-foreground mb-4">点击智能体卡片开始专业诊断对话</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {agents.map((agent) => (
              <div
                key={agent.id}
                onClick={() => handleSelectAgent(agent)}
                className={cn(
                  "bg-gradient-to-br from-card to-secondary border-2 rounded-2xl p-5 cursor-pointer transition-all duration-300 text-center relative overflow-hidden group",
                  "hover:-translate-y-1 hover:border-primary/50",
                  currentAgent?.id === agent.id 
                    ? "border-primary glow-primary" 
                    : "border-border"
                )}
              >
                {/* Hover gradient */}
                <div className="absolute inset-0 bg-gradient-to-br from-transparent to-primary/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                
                <div className="relative z-10">
                  <div className="text-4xl mb-3">{agent.icon}</div>
                  <div className="font-semibold text-sm mb-2">{agent.name}</div>
                  <div className="text-xs text-muted-foreground line-clamp-2">
                    {agent.description.substring(0, 30)}...
                  </div>
                </div>
              </div>
            ))}
          </div>
        </PageCard>

        {/* Chat area */}
        <PageCard 
          title={currentAgent ? `${currentAgent.icon} ${currentAgent.name}` : '💬 智能体对话'} 
          icon=""
        >
          {currentAgent ? (
            <ChatBox
              messages={agentMessages}
              onSend={handleSendMessage}
              placeholder={`向${currentAgent.name}提问...`}
              isLoading={isLoading}
            />
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <span className="text-5xl block mb-4">👆</span>
              <p>请先点击上方选择一个智能体开始对话</p>
            </div>
          )}
        </PageCard>
      </div>
    </MainLayout>
  );
}
