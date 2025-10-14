import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function MessageBubble({ role, content, timestamp }) {
  const isUser = role === 'user';

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

        {/* Timestamp (separate line, not concatenated) */}
        {timestamp && (
          <div className={`text-xs mt-2 ${isUser ? 'text-yellow-100' : 'text-gray-500'} text-right`}>
            {new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </div>
        )}
      </div>
    </div>
  );
}
