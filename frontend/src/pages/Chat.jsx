import React, { useState, useEffect, useRef } from 'react';
import MessageBubble from '../components/MessageBubble.jsx';
import { useParams } from 'react-router-dom';
import { PaperAirplaneIcon, DocumentArrowUpIcon } from '@heroicons/react/24/outline';
import axios from 'axios';

const Chat = ({ user }) => {
  const { planId } = useParams();
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (planId) {
      fetchPlan();
    } else {
      // Start with welcome message
      setMessages([{
        role: 'assistant',
        content: `Hello ${user.firstName}! I'm your Vanderbilt Program Planning Assistant. I can help you navigate policies, timelines, and requirements for campus events.

To get started, tell me about the program you're planning:


1. **Event Type:** What type of event? (mixer, concert, workshop, lecture, etc.)
2. **Location:** Will it be on-campus or off-campus?
3. **Alcohol:** Will alcohol be involved?
4. **Expected Attendance:** How many people do you expect to attend?
5. **Target Date:** When are you planning to hold it?

I'll guide you through all the necessary steps and create a personalized checklist!`,
        timestamp: new Date()
      }]);
    }
  }, [planId, user.firstName]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchPlan = async () => {
    try {
      const response = await axios.get(`/api/plans/${planId}`);
      setPlan(response.data);
      setMessages(response.data.conversationHistory || []);
    } catch (error) {
      console.error('Error fetching plan:', error);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || loading) return;

    const userMessage = {
      role: 'user',
      content: inputMessage.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setLoading(true);

    try {
      const response = await axios.post('/api/chat', {
        message: inputMessage.trim(),
        planId: planId,
        context: messages.slice(-10) // Send last 10 messages for context
      });

      const assistantMessage = {
        role: 'assistant',
        content: response.data.response,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage = {
        role: 'assistant',
        content: 'I apologize, but I encountered an error processing your message. Please try again.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const formatMessage = (content) => {
    // Simple formatting for bullet points and line breaks
    return content.split('\n').map((line, index) => (
      <div key={index} className={line.trim().startsWith('•') || line.trim().startsWith('-') ? 'ml-4' : ''}>
        {line}
      </div>
    ));
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              {plan ? plan.title : 'New Program Plan'}
            </h1>
            <p className="text-sm text-gray-500">
              AI-powered program planning assistance
            </p>
          </div>
          {plan && (
            <div className="text-sm text-gray-500">
              Plan ID: {plan._id}
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
  {/* Messages */}
<div className="flex-1 overflow-y-auto p-6 space-y-4">
  {messages.map((m, i) => (
    <MessageBubble
      key={i}
      role={m.role}
      content={m.content}
      timestamp={m.timestamp}
    />
  ))}

  {loading && (
    <div className="flex justify-start">
      <div className="bg-white border border-gray-200 text-gray-900 px-4 py-3 rounded-lg">
        <div className="flex items-center space-x-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-vanderbilt-gold"></div>
          <span className="text-sm">AI is thinking...</span>
        </div>
      </div>
    </div>
  )}

  <div ref={messagesEndRef} />
</div>

      {/* Input */}
      <div className="bg-white border-t border-gray-200 px-6 py-4">
        <form onSubmit={handleSendMessage} className="flex space-x-4">
          <div className="flex-1">
            <textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage(e);
                }
              }}
              placeholder="Ask me about program planning policies, timelines, requirements..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-vanderbilt-gold focus:border-vanderbilt-gold resize-none"
              rows="3"
              disabled={loading}
            />
          </div>
          <div className="flex flex-col space-y-2">
            <button
              type="submit"
              disabled={loading || !inputMessage.trim()}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-vanderbilt-gold hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-vanderbilt-gold disabled:opacity-50"
            >
              <PaperAirplaneIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-vanderbilt-gold"
            >
              <DocumentArrowUpIcon className="h-4 w-4" />
            </button>
          </div>
        </form>
        <div className="mt-2 text-xs text-gray-500">
          Press Enter to send, Shift+Enter for new line
        </div>
      </div>
    </div>
  );
};

export default Chat;