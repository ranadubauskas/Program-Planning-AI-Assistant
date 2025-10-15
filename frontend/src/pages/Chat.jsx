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

  const handleSaveEvent = async (content, timestamp, currentPlanId) => {
    try {
      // Use AI to intelligently generate event data
      const eventData = await generateEventWithAI(content, timestamp, currentPlanId);
      
      const response = await axios.post('/api/events', {
        ...eventData,
        userId: user._id,
        planId: currentPlanId || planId,
        sourceMessage: {
          content,
          timestamp,
          conversationContext: messages.slice(-3).map(m => m.content) // Last 3 messages for context
        }
      });

      console.log('Event saved:', response.data);
      alert('Event saved successfully!'); // Temporary feedback
    } catch (error) {
      console.error('Error saving event:', error);
      alert('Failed to save event. Please try again.');
    }
  };

  const generateEventWithAI = async (content, timestamp, currentPlanId) => {
    try {
      // Create a focused prompt for the AI to generate structured event data
      const eventPrompt = `Based on this message, create a structured event with a clear title and organized checklist:

"${content}"

Generate a JSON response with this exact structure:
{
  "title": "Event Name (e.g., 'Mixer April 2026', 'Team Meeting December 2024')",
  "description": "Brief 1-2 sentence summary of the event",
  "eventDate": "YYYY-MM-DD format if a date is mentioned, or null",
  "category": "meeting|deadline|task|milestone|other",
  "priority": "low|medium|high|critical",
  "checklist": [
    {
      "task": "Clear task description",
      "dueDate": "YYYY-MM-DD format - when this task should be completed",
      "priority": "low|medium|high|critical",
      "completed": false
    }
  ]
}

Rules:
1. Extract the main event date if mentioned (e.g., "April 7th 2026" -> "2026-04-07")
2. Create logical task due dates that work backwards from the event date
3. Sort checklist by due dates (earliest tasks first)
4. Venue booking: 3-4 weeks before event
5. Invitations: 2-3 weeks before event  
6. Catering/Food: 1-2 weeks before event
7. Setup/Equipment: 2-3 days before event
8. Make the title concise but descriptive (e.g., "Workshop May 2025", "Meeting Q1 2024")

Only return the JSON, no other text.`;

      const aiResponse = await axios.post('/api/chat', {
        message: eventPrompt,
        planId: currentPlanId,
        context: [] // No context needed for this focused task
      });

      // Parse the AI response to get structured data
      const aiContent = aiResponse.data.response;
      
      // Try to extract JSON from the AI response
      let eventData;
      try {
        // Look for JSON in the response
        const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          eventData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in AI response');
        }
      } catch (parseError) {
        console.warn('Failed to parse AI response, using fallback:', parseError);
        // Fallback to simple extraction if AI parsing fails
        eventData = extractEventFromContent(content, timestamp, currentPlanId);
      }

      // Validate and clean the data
      return {
        title: eventData.title || 'Event from Chat',
        description: eventData.description || 'Event planning checklist',
        eventDate: eventData.eventDate ? new Date(eventData.eventDate) : null,
        category: eventData.category || 'task',
        priority: eventData.priority || 'medium',
        checklist: eventData.checklist || [],
        timeline: [], // Focus on checklist
        status: 'pending'
      };

    } catch (error) {
      console.warn('AI event generation failed, using fallback:', error);
      // Fallback to the original extraction method if AI call fails
      return extractEventFromContent(content, timestamp, currentPlanId);
    }
  };

  const extractEventFromContent = (content, timestamp, currentPlanId) => {
    const lines = content.split('\n');
    const lowerContent = content.toLowerCase();
    
    // Smart event naming logic
    let title = generateSmartEventName(content);
    let eventDate = extractMainEventDate(content);
    let category = detectEventCategory(content);
    let priority = detectPriority(content);
    
    // Focus on extracting and organizing checklist with intelligent due dates
    const checklist = extractAndOrganizeChecklist(content, eventDate);
    
    // Create minimal description (just the event summary, not the full content)
    let description = extractEventSummary(content);

    return {
      title,
      description,
      eventDate,
      category,
      priority,
      checklist,
      timeline: [], // Focus on checklist, minimal timeline
      status: 'pending'
    };
  };

  const generateSmartEventName = (content) => {
    const lowerContent = content.toLowerCase();
    
    // Extract event type and date for naming
    let eventType = 'Event';
    let dateStr = '';
    
    // Detect event type
    if (lowerContent.includes('mixer')) eventType = 'Mixer';
    else if (lowerContent.includes('concert')) eventType = 'Concert';
    else if (lowerContent.includes('workshop')) eventType = 'Workshop';
    else if (lowerContent.includes('meeting')) eventType = 'Meeting';
    else if (lowerContent.includes('conference')) eventType = 'Conference';
    else if (lowerContent.includes('lecture')) eventType = 'Lecture';
    else if (lowerContent.includes('seminar')) eventType = 'Seminar';
    else if (lowerContent.includes('event')) eventType = 'Event';
    
    // Extract date information for naming
    const monthYearRegex = /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i;
    const monthMatch = content.match(monthYearRegex);
    
    if (monthMatch) {
      const month = monthMatch[1].charAt(0).toUpperCase() + monthMatch[1].slice(1);
      const year = monthMatch[2];
      dateStr = ` ${month} ${year}`;
    } else {
      // Try to extract just year or month
      const yearMatch = content.match(/\b(202[4-9]|20[3-9]\d)\b/);
      const monthOnlyMatch = content.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i);
      
      if (yearMatch) {
        dateStr = ` ${yearMatch[0]}`;
      } else if (monthOnlyMatch) {
        const month = monthOnlyMatch[0].charAt(0).toUpperCase() + monthOnlyMatch[0].slice(1);
        dateStr = ` ${month}`;
      }
    }
    
    return `${eventType}${dateStr}`;
  };

  const extractMainEventDate = (content) => {
    // Try various date formats
    const dateFormats = [
      /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,  // MM/DD/YYYY or MM-DD-YYYY
      /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{4})/i,  // Month DD, YYYY
      /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i  // Month YYYY
    ];
    
    for (const regex of dateFormats) {
      const match = content.match(regex);
      if (match) {
        try {
          return new Date(match[0]);
        } catch (e) {
          continue;
        }
      }
    }
    return null;
  };

  const detectEventCategory = (content) => {
    const lowerContent = content.toLowerCase();
    if (lowerContent.includes('meeting') || lowerContent.includes('conference')) return 'meeting';
    if (lowerContent.includes('deadline') || lowerContent.includes('due')) return 'deadline';
    if (lowerContent.includes('milestone')) return 'milestone';
    return 'task';
  };

  const detectPriority = (content) => {
    const lowerContent = content.toLowerCase();
    if (lowerContent.includes('critical') || lowerContent.includes('urgent') || lowerContent.includes('asap')) return 'critical';
    if (lowerContent.includes('high') || lowerContent.includes('important') || lowerContent.includes('priority')) return 'high';
    if (lowerContent.includes('low') || lowerContent.includes('optional')) return 'low';
    return 'medium';
  };

  const extractAndOrganizeChecklist = (content, mainEventDate) => {
    const lines = content.split('\n');
    const checklist = [];
    
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
        const taskText = trimmed.substring(1).trim();
        if (taskText) {
          const taskInfo = parseTaskWithDueDate(taskText, mainEventDate);
          checklist.push(taskInfo);
        }
      }
    });
    
    // Sort checklist by due dates (earliest first)
    checklist.sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate) - new Date(b.dueDate);
    });
    
    return checklist;
  };

  const parseTaskWithDueDate = (taskText, mainEventDate) => {
    // Extract due date from task text if present
    let task = taskText;
    let dueDate = null;
    let priority = 'medium';
    
    // Look for due date patterns in the task text
    const dueDatePatterns = [
      /\(due\s+([^)]+)\)/i,
      /\(by\s+([^)]+)\)/i,
      /due\s+([a-z]+ \d{1,2})/i,
      /by\s+([a-z]+ \d{1,2})/i
    ];
    
    for (const pattern of dueDatePatterns) {
      const match = taskText.match(pattern);
      if (match) {
        try {
          dueDate = new Date(match[1]);
          task = taskText.replace(match[0], '').trim();
          break;
        } catch (e) {
          continue;
        }
      }
    }
    
    // Assign smart default due dates based on task type if no explicit date
    if (!dueDate && mainEventDate) {
      dueDate = getSmartDueDate(task, mainEventDate);
    }
    
    // Determine priority from task text
    if (task.toLowerCase().includes('urgent') || task.toLowerCase().includes('critical')) {
      priority = 'critical';
    } else if (task.toLowerCase().includes('important') || task.toLowerCase().includes('asap')) {
      priority = 'high';
    }
    
    return {
      task: task,
      description: '',
      dueDate,
      priority,
      completed: false
    };
  };

  const getSmartDueDate = (task, mainEventDate) => {
    const taskLower = task.toLowerCase();
    const eventDate = new Date(mainEventDate);
    
    // Smart due date assignment based on task type
    if (taskLower.includes('book') || taskLower.includes('reserve') || taskLower.includes('venue')) {
      // Booking tasks - 3-4 weeks before
      return new Date(eventDate.getTime() - (25 * 24 * 60 * 60 * 1000));
    } else if (taskLower.includes('invitation') || taskLower.includes('invite') || taskLower.includes('rsvp')) {
      // Invitation tasks - 2-3 weeks before  
      return new Date(eventDate.getTime() - (18 * 24 * 60 * 60 * 1000));
    } else if (taskLower.includes('catering') || taskLower.includes('food') || taskLower.includes('menu')) {
      // Catering tasks - 1-2 weeks before
      return new Date(eventDate.getTime() - (10 * 24 * 60 * 60 * 1000));
    } else if (taskLower.includes('setup') || taskLower.includes('equipment') || taskLower.includes('av')) {
      // Setup tasks - 2-3 days before
      return new Date(eventDate.getTime() - (2 * 24 * 60 * 60 * 1000));
    } else if (taskLower.includes('agenda') || taskLower.includes('material') || taskLower.includes('prepare')) {
      // Preparation tasks - 1 week before
      return new Date(eventDate.getTime() - (7 * 24 * 60 * 60 * 1000));
    } else {
      // Default - 1 week before
      return new Date(eventDate.getTime() - (7 * 24 * 60 * 60 * 1000));
    }
  };

  const extractEventSummary = (content) => {
    const lines = content.split('\n');
    // Take first non-bullet point line as summary
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('•') && !trimmed.startsWith('-') && !trimmed.startsWith('*')) {
        return trimmed.length > 150 ? trimmed.substring(0, 150) + '...' : trimmed;
      }
    }
    return 'Event planning checklist';
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
      onSaveEvent={handleSaveEvent}
      user={user}
      planId={planId}
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