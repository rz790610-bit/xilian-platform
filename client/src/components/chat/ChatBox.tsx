import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send } from 'lucide-react';
import type { ChatMessage } from '@/types';

interface ChatBoxProps {
  messages: ChatMessage[];
  onSend: (message: string) => void;
  placeholder?: string;
  isLoading?: boolean;
  className?: string;
}

export function ChatBox({ messages, onSend, placeholder = '输入消息...', isLoading, className }: ChatBoxProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    if (input.trim() && !isLoading) {
      onSend(input.trim());
      setInput('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={cn("flex flex-col bg-card rounded-xl overflow-hidden", className)}>
      {/* Messages area */}
      <div className="flex-1 p-5 overflow-y-auto min-h-[300px] max-h-[400px] space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed animate-slide-in whitespace-pre-wrap",
              msg.role === 'user' 
                ? "ml-auto chat-msg-user rounded-br-sm" 
                : "chat-msg-ai rounded-bl-sm"
            )}
          >
            {msg.content}
          </div>
        ))}
        
        {isLoading && (
          <div className="chat-msg-ai max-w-[80%] px-4 py-3 rounded-2xl rounded-bl-sm text-sm">
            <span className="animate-pulse">思考中...</span>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="flex gap-3 p-4 bg-secondary border-t border-border">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={placeholder}
          disabled={isLoading}
          className="flex-1 bg-card"
        />
        <Button 
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          className="gap-2"
        >
          <Send className="w-4 h-4" />
          发送
        </Button>
      </div>
    </div>
  );
}
