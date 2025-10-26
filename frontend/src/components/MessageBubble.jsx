import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookmarkIcon } from '@heroicons/react/24/outline';
import { BookmarkIcon as BookmarkIconSolid } from '@heroicons/react/24/solid';

export default function MessageBubble({ role, content, timestamp, onSaveEvent, user, planId, eventContext }) {
  const isUser = role === 'user';
  const [isSaved, setIsSaved] = useState(false);

  // Check if message contains event-like content
  const containsEventContent = !isUser && content && (
    content.toLowerCase().includes('deadline') ||
    content.toLowerCase().includes('due date') ||
    content.toLowerCase().includes('schedule') ||
    content.toLowerCase().includes('meeting') ||
    content.toLowerCase().includes('event') ||
    content.toLowerCase().includes('task') ||
    content.toLowerCase().includes('checklist') ||
    content.toLowerCase().includes('timeline') ||
    /\d{1,2}\/\d{1,2}\/\d{4}/.test(content) || // Date pattern
    /\d{1,2}-\d{1,2}-\d{4}/.test(content) ||
    content.includes('by ') && (content.includes('date') || content.includes('time'))
  );

  // Show save button for messages with event-like content, but NOT when in event context mode (continue chat)
  const showSaveButton = containsEventContent && onSaveEvent && !eventContext;

  const handleSaveEvent = async () => {
    if (onSaveEvent && !isSaved) {
      try {
        await onSaveEvent(content, timestamp, planId);
        setIsSaved(true);
      } catch (error) {
        console.error('Failed to save event:', error);
      }
    }
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-3xl px-4 py-3 rounded-lg shadow
          ${isUser
            ? 'bg-vanderbilt-gold text-white'
            : 'bg-white border border-gray-200 text-gray-900'}`}
      >
        {/* Markdown content */}
        <div
          className={`prose prose-sm sm:prose-base max-w-none break-words overflow-x-auto
                      prose-headings:mt-3 prose-headings:mb-2
                      prose-h3:text-lg prose-h4:text-base
                      prose-p:my-2 prose-li:my-1 prose-strong:font-semibold
                      prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded
                      ${isUser ? 'prose-invert' : ''}`}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
            {content?.trim() || ''}
          </ReactMarkdown>
        </div>

        {/* Timestamp and Save Button */}
        <div className="flex items-center justify-between mt-2">
          {timestamp && (
            <div className={`text-xs ${isUser ? 'text-yellow-100' : 'text-gray-500'}`}>
              {new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </div>
          )}
          
          {/* Save Event Button */}
          {showSaveButton && (
            <button
              onClick={handleSaveEvent}
              disabled={isSaved}
              className={`ml-2 px-3 py-1 text-sm rounded-md border transition-colors ${
                isSaved
                  ? 'bg-green-100 text-green-800 border-green-300 cursor-not-allowed'
                  : 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200'
              }`}
              title={isSaved ? 'Event saved' : 'Save as event'}
            >
              {isSaved ? (
                <span>✓ Saved</span>
              ) : (
                <span>📑 Save Event</span>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
