import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { CalendarIcon, CheckCircleIcon } from '@heroicons/react/24/outline';

const PublicEvent = () => {
  const { shareId } = useParams();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const resp = await axios.get(`/api/public/events/${shareId}`);
        setEvent(resp.data);
      } catch (e) {
        setError('Shared event not found or link is invalid.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [shareId]);

  const formatDate = (date) => (date ? new Date(date).toLocaleDateString() : 'No date set');

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-vanderbilt-gold"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white border border-gray-200 p-6 rounded-lg text-gray-700">{error}</div>
      </div>
    );
  }

  if (!event) return null;

  // Group by time headers if present
  const items = event.checklist || [];
  const groups = [];
  let current = { header: null, items: [] };
  items.forEach((it) => {
    if (it.isTimeHeader) {
      if (current.header || current.items.length) groups.push(current);
      current = { header: it.task.replace(/^---\s*/, '').replace(/\s*---$/, ''), items: [] };
    } else {
      current.items.push(it);
    }
  });
  if (current.header || current.items.length) groups.push(current);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900">{event.title}</h1>
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 mt-2">
            <span className="inline-flex items-center"><CalendarIcon className="h-4 w-4 mr-1" />{formatDate(event.eventDate)}</span>
            {event.priority && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700">{event.priority}</span>
            )}
            {event.category && (
              <span className="text-xs text-gray-500 capitalize">{event.category}</span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {event.description && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Description</h2>
            <p className="text-gray-700 whitespace-pre-line leading-relaxed">{event.description}</p>
          </div>
        )}

        {!!groups.length && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Checklist</h2>
            <div className="space-y-6">
              {groups.map((g, gi) => (
                <div key={gi}>
                  {g.header && (
                    <div className="bg-vanderbilt-gold bg-opacity-10 border-l-4 border-vanderbilt-gold px-4 py-2 mb-3">
                      <h3 className="font-semibold text-gray-900 text-sm">{g.header}</h3>
                    </div>
                  )}
                  <div className="space-y-2">
                    {g.items.map((item, idx) => (
                      <div key={idx} className="flex items-start space-x-3 p-3 rounded-lg border border-gray-100">
                        <div className="h-5 w-5 mt-0.5 flex-shrink-0">
                          {item.completed ? (
                            <CheckCircleIcon className="h-full w-full text-green-600" />
                          ) : (
                            <CheckCircleIcon className="h-full w-full text-gray-300" />
                          )}
                        </div>
                        <div className="flex-1">
                          <p className={`transition-all ${item.completed ? 'line-through text-gray-500' : 'text-gray-900'}`}>{item.task}</p>
                          <div className="flex items-center space-x-4 mt-1 text-xs text-gray-500">
                            {item.dueDate && <span>Due: {new Date(item.dueDate).toLocaleDateString()}</span>}
                            {item.priority && <span>Priority: {item.priority}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PublicEvent;


