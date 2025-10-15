import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { 
  CalendarIcon, 
  ClockIcon, 
  CheckCircleIcon, 
  TrashIcon
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleIconSolid } from '@heroicons/react/24/solid';

const SavedEvents = ({ user }) => {
  const { eventId } = useParams();
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEvents();
  }, [user, eventId]);

  const fetchEvents = async () => {
    try {
      const response = await axios.get(`/api/events?userId=${user._id}`);
      setEvents(response.data);
      
      // Auto-select event if eventId is provided in URL
      if (eventId && response.data.length > 0) {
        const targetEvent = response.data.find(event => event._id === eventId);
        if (targetEvent) {
          setSelectedEvent(targetEvent);
        }
      }
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteEvent = async (eventId) => {
    if (window.confirm('Are you sure you want to delete this event?')) {
      try {
        await axios.delete(`/api/events/${eventId}`);
        setEvents(events.filter(event => event._id !== eventId));
        if (selectedEvent && selectedEvent._id === eventId) {
          setSelectedEvent(null);
        }
      } catch (error) {
        console.error('Error deleting event:', error);
      }
    }
  };

  const formatDate = (date) => {
    return date ? new Date(date).toLocaleDateString() : 'No date set';
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'critical': return 'text-red-600 bg-red-50';
      case 'high': return 'text-orange-600 bg-orange-50';
      case 'medium': return 'text-blue-600 bg-blue-50';
      case 'low': return 'text-gray-600 bg-gray-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'meeting': return <CalendarIcon className="h-4 w-4" />;
      case 'deadline': return <ClockIcon className="h-4 w-4" />;
      case 'task': return <CheckCircleIcon className="h-4 w-4" />;
      default: return <CalendarIcon className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-vanderbilt-gold"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900">Saved Events</h1>
        <p className="text-gray-600">Events saved from your chat conversations</p>
      </div>

      <div className="flex h-screen">
        {/* Events List */}
        <div className="w-1/3 bg-white border-r border-gray-200 overflow-y-auto">
          <div className="p-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Events</h2>
            {events.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                No saved events yet. Save events from chat to see them here!
              </p>
            ) : (
              <div className="space-y-3">
                {events.map((event) => (
                  <div
                    key={event._id}
                    onClick={() => setSelectedEvent(event)}
                    className={`p-4 rounded-lg border cursor-pointer transition-all ${
                      selectedEvent?._id === event._id
                        ? 'border-vanderbilt-gold bg-yellow-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          {getCategoryIcon(event.category)}
                          <h3 className="font-medium text-gray-900 truncate">
                            {event.title}
                          </h3>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                          {formatDate(event.eventDate)}
                        </p>
                        <div className="flex items-center space-x-2 mt-2">
                          <span className={`px-2 py-1 text-xs rounded-full ${getPriorityColor(event.priority)}`}>
                            {event.priority}
                          </span>
                          <span className="text-xs text-gray-500">
                            {event.checklist?.filter(item => item.completed).length || 0}/
                            {event.checklist?.length || 0} tasks
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Event Details */}
        <div className="flex-1 bg-gray-50">
          {selectedEvent ? (
            <div className="p-6">
              {/* Event Header */}
              <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">
                      {selectedEvent.title}
                    </h1>
                    <div className="flex items-center space-x-4 text-sm text-gray-500">
                      <div className="flex items-center space-x-1">
                        <CalendarIcon className="h-4 w-4" />
                        <span>{formatDate(selectedEvent.eventDate)}</span>
                      </div>
                      <span className={`px-2 py-1 rounded-full ${getPriorityColor(selectedEvent.priority)}`}>
                        {selectedEvent.priority} priority
                      </span>
                      <span className="capitalize">{selectedEvent.category}</span>
                    </div>
                    {selectedEvent.description && (
                      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                        <h3 className="font-medium text-gray-900 mb-2">Description:</h3>
                        <p className="text-gray-700 whitespace-pre-line">
                          {selectedEvent.description}
                        </p>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => deleteEvent(selectedEvent._id)}
                    className="text-red-600 hover:text-red-800 p-2"
                    title="Delete event"
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Checklist */}
              {selectedEvent.checklist && selectedEvent.checklist.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">
                    Checklist ({selectedEvent.checklist.filter(item => item.completed).length}/
                    {selectedEvent.checklist.length})
                  </h2>
                  <div className="space-y-3">
                    {selectedEvent.checklist.map((item, index) => (
                      <div key={index} className="flex items-start space-x-3">
                        <CheckCircleIconSolid 
                          className={`h-5 w-5 mt-0.5 flex-shrink-0 ${
                            item.completed ? 'text-green-600' : 'text-gray-300'
                          }`} 
                        />
                        <div className="flex-1">
                          <p className={`${item.completed ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                            {item.task}
                          </p>
                          {item.description && (
                            <p className="text-sm text-gray-500 mt-1">{item.description}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Source Message */}
              {selectedEvent.sourceMessage && (
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Original Chat Message</h2>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-gray-700 whitespace-pre-line">
                      {selectedEvent.sourceMessage.content}
                    </p>
                    <p className="text-sm text-gray-500 mt-2">
                      Saved on: {new Date(selectedEvent.sourceMessage.timestamp || selectedEvent.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <CalendarIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 text-lg">Select an event to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SavedEvents;