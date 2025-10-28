import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PlusIcon, ChatBubbleLeftRightIcon, CalendarIcon, ClipboardDocumentListIcon, BookmarkIcon } from '@heroicons/react/24/outline';
import axios from 'axios';

const Dashboard = ({ user }) => {
  const [plans, setPlans] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [user]);

  const fetchData = async () => {
    try {
      const [plansResponse, eventsResponse] = await Promise.all([
        axios.get(`/api/plans?userId=${user._id}`),
        axios.get(`/api/events?userId=${user._id}`)
      ]);
      setPlans(plansResponse.data);
      setEvents(eventsResponse.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'planning': return 'bg-blue-100 text-blue-800';
      case 'approved': return 'bg-green-100 text-green-800';
      case 'in-progress': return 'bg-yellow-100 text-yellow-800';
      case 'completed': return 'bg-gray-100 text-gray-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'critical': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'medium': return 'bg-blue-100 text-blue-800';
      case 'low': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (date) => {
    return date ? new Date(date).toLocaleDateString() : 'No date';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="px-4 py-6 sm:px-0">
        {/* Header */}
        <div className="md:flex md:items-center md:justify-between mb-8">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
              Welcome back, {user.firstName}!
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Plan and manage your Vanderbilt programs with AI assistance
            </p>
          </div>
          <div className="mt-4 flex md:mt-0 md:ml-4">
            <Link
              to="/chat"
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <ChatBubbleLeftRightIcon className="h-4 w-4 mr-2" />
              Start New Plan
            </Link>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 mb-8">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <ClipboardDocumentListIcon className="h-6 w-6 text-gray-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Total Plans
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {plans.length}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <CalendarIcon className="h-6 w-6 text-gray-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Active Plans
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {plans.filter(p => ['planning', 'approved', 'in-progress'].includes(p.status)).length}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <BookmarkIcon className="h-6 w-6 text-gray-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Saved Events
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {events.length}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Plans */}
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <div className="px-4 py-5 sm:px-6">
            <h2 className="text-lg leading-6 font-medium text-gray-900">
              Your Program Plans & Events
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              Manage your program plans and saved events from chat conversations
            </p>
          </div>
          
          {plans.length === 0 && events.length === 0 ? (
            <div className="text-center py-12">
              <ChatBubbleLeftRightIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No plans or events yet</h3>
              <p className="mt-1 text-sm text-gray-500">
                Get started by creating your first program plan or save events from chat conversations.
              </p>
              <div className="mt-6">
                <Link
                  to="/chat"
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Start Planning
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Program Plans Section */}
              {plans.length > 0 && (
                <div>
                  <h3 className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50 border-b">
                    Program Plans ({plans.length})
                  </h3>
                  <ul className="divide-y divide-gray-200">
                    {plans.map((plan) => (
                      <li key={`plan-${plan._id}`}>
                        <Link
                          to={`/plan/${plan._id}`}
                          className="block hover:bg-gray-50 px-4 py-4 sm:px-6"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center">
                              <ClipboardDocumentListIcon className="h-5 w-5 text-gray-400 mr-3" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-indigo-600 truncate">
                                  {plan.title}
                                </p>
                                <p className="text-sm text-gray-500">
                                  {plan.programType} • {plan.location?.type}
                                  {plan.hasAlcohol && ' • Alcohol'}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(plan.status)}`}>
                                {plan.status}
                              </span>
                              <div className="text-sm text-gray-500">
                                {plan.timeline?.eventDate && new Date(plan.timeline.eventDate).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Saved Events Section */}
              {events.length > 0 && (
                <div>
                  <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b">
                    <h3 className="text-sm font-medium text-gray-700">
                      Saved Events ({events.length})
                    </h3>
                    <Link 
                      to="/events" 
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      View All →
                    </Link>
                  </div>
                  <ul className="divide-y divide-gray-200">
                    {events.map((event) => (
                      <li key={`event-${event._id}`}>
                        <Link
                          to={`/events/${event._id}`}
                          className="block hover:bg-gray-50 px-4 py-4 sm:px-6"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center">
                              <BookmarkIcon className="h-5 w-5 text-gray-400 mr-3" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-blue-600 truncate">
                                  {event.title}
                                </p>
                                <p className="text-sm text-gray-500">
                                  {event.category} • {event.checklist?.length || 0} tasks
                                  {event.eventDate && ` • ${formatDate(event.eventDate)}`}
                                  {event.expectedAttendance && ` • ${event.expectedAttendance} attendees`}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(event.priority)}`}>
                                {event.priority}
                              </span>
                              <div className="text-sm text-gray-500">
                                {event.checklist?.filter(t => t.completed).length || 0}/{event.checklist?.length || 0}
                              </div>
                            </div>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;