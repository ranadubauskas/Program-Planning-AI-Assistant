import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  CheckCircleIcon, 
  ClockIcon, 
  ExclamationTriangleIcon, 
  ChatBubbleLeftRightIcon,
  CalendarIcon,
  MapPinIcon,
  UsersIcon,
  CurrencyDollarIcon
} from '@heroicons/react/24/outline';
import axios from 'axios';

const PlanDetails = ({ user }) => {
  const { planId } = useParams();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPlan();
  }, [planId]);

  const fetchPlan = async () => {
    try {
      const response = await axios.get(`/api/plans/${planId}`);
      setPlan(response.data);
    } catch (error) {
      console.error('Error fetching plan:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleChecklistItem = async (index) => {
    const updatedChecklist = [...plan.checklist];
    updatedChecklist[index].completed = !updatedChecklist[index].completed;
    
    try {
      await axios.put(`/api/plans/${planId}`, {
        checklist: updatedChecklist
      });
      setPlan({...plan, checklist: updatedChecklist});
    } catch (error) {
      console.error('Error updating checklist:', error);
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'critical': return 'text-red-600 bg-red-50 border-red-200';
      case 'high': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'low': return 'text-green-600 bg-green-50 border-green-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-vanderbilt-gold"></div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">Plan not found</h2>
          <Link to="/dashboard" className="text-vanderbilt-gold hover:underline">
            Return to Dashboard
          </Link>
        </div>
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
              {plan.title}
            </h1>
            <div className="mt-2 flex items-center space-x-4">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(plan.status)}`}>
                {plan.status}
              </span>
              <span className="text-sm text-gray-500">
                Created {new Date(plan.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
          <div className="mt-4 flex space-x-3 md:mt-0 md:ml-4">
            <Link
              to={`/chat/${planId}`}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-vanderbilt-gold"
            >
              <ChatBubbleLeftRightIcon className="h-4 w-4 mr-2" />
              Continue Chat
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Plan Details */}
            <div className="bg-white shadow overflow-hidden sm:rounded-lg">
              <div className="px-4 py-5 sm:px-6">
                <h2 className="text-lg leading-6 font-medium text-gray-900">
                  Event Details
                </h2>
              </div>
              <div className="border-t border-gray-200 px-4 py-5 sm:p-0">
                <dl className="sm:divide-y sm:divide-gray-200">
                  <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                    <dt className="text-sm font-medium text-gray-500 flex items-center">
                      <CalendarIcon className="h-4 w-4 mr-2" />
                      Program Type
                    </dt>
                    <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                      {plan.programType}
                    </dd>
                  </div>
                  
                  <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                    <dt className="text-sm font-medium text-gray-500 flex items-center">
                      <MapPinIcon className="h-4 w-4 mr-2" />
                      Location
                    </dt>
                    <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                      {plan.location?.type} {plan.location?.venue && `- ${plan.location.venue}`}
                    </dd>
                  </div>

                  {plan.expectedAttendance && (
                    <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500 flex items-center">
                        <UsersIcon className="h-4 w-4 mr-2" />
                        Expected Attendance
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        {plan.expectedAttendance} people
                      </dd>
                    </div>
                  )}

                  {plan.budget?.amount && (
                    <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500 flex items-center">
                        <CurrencyDollarIcon className="h-4 w-4 mr-2" />
                        Budget
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        ${plan.budget.amount.toLocaleString()} {plan.budget.currency}
                      </dd>
                    </div>
                  )}

                  <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                    <dt className="text-sm font-medium text-gray-500">
                      Alcohol Involved
                    </dt>
                    <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                      {plan.hasAlcohol ? 'Yes' : 'No'}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* Checklist */}
            <div className="bg-white shadow overflow-hidden sm:rounded-lg">
              <div className="px-4 py-5 sm:px-6">
                <h2 className="text-lg leading-6 font-medium text-gray-900">
                  Planning Checklist
                </h2>
                <p className="mt-1 max-w-2xl text-sm text-gray-500">
                  Track your progress through the program planning process
                </p>
              </div>
              <div className="border-t border-gray-200">
                {plan.checklist && plan.checklist.length > 0 ? (
                  <ul className="divide-y divide-gray-200">
                    {plan.checklist.map((item, index) => (
                      <li key={index} className="px-4 py-4 sm:px-6">
                        <div className="flex items-start space-x-3">
                          <button
                            onClick={() => toggleChecklistItem(index)}
                            className="flex-shrink-0 mt-1"
                          >
                            <CheckCircleIcon
                              className={`h-5 w-5 ${
                                item.completed
                                  ? 'text-green-500'
                                  : 'text-gray-300 hover:text-gray-400'
                              }`}
                            />
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <p className={`text-sm font-medium ${
                                item.completed ? 'text-gray-500 line-through' : 'text-gray-900'
                              }`}>
                                {item.task}
                              </p>
                              <div className="flex items-center space-x-2">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getPriorityColor(item.priority)}`}>
                                  {item.priority}
                                </span>
                                {item.dueDate && (
                                  <div className="flex items-center text-sm text-gray-500">
                                    <ClockIcon className="h-4 w-4 mr-1" />
                                    {new Date(item.dueDate).toLocaleDateString()}
                                  </div>
                                )}
                              </div>
                            </div>
                            {item.description && (
                              <p className="mt-1 text-sm text-gray-500">
                                {item.description}
                              </p>
                            )}
                            {item.policyReference && (
                              <p className="mt-1 text-xs text-blue-600">
                                Policy: {item.policyReference}
                              </p>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-center py-12">
                    <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No checklist generated</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Continue chatting with the AI to generate your planning checklist.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white shadow overflow-hidden sm:rounded-lg">
              <div className="px-4 py-5 sm:px-6">
                <h2 className="text-lg leading-6 font-medium text-gray-900">
                  Timeline
                </h2>
              </div>
              <div className="border-t border-gray-200 px-4 py-5">
                {plan.timeline?.eventDate ? (
                  <div className="space-y-4">
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Event Date</dt>
                      <dd className="mt-1 text-sm text-gray-900">
                        {new Date(plan.timeline.eventDate).toLocaleDateString()}
                      </dd>
                    </div>
                    {plan.timeline.planningStartDate && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Planning Started</dt>
                        <dd className="mt-1 text-sm text-gray-900">
                          {new Date(plan.timeline.planningStartDate).toLocaleDateString()}
                        </dd>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">
                    No timeline set. Continue chatting to set important dates.
                  </p>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="mt-6 bg-white shadow overflow-hidden sm:rounded-lg">
              <div className="px-4 py-5 sm:px-6">
                <h2 className="text-lg leading-6 font-medium text-gray-900">
                  Quick Actions
                </h2>
              </div>
              <div className="border-t border-gray-200 px-4 py-5 space-y-3">
                <Link
                  to={`/chat/${planId}`}
                  className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-vanderbilt-gold hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-vanderbilt-gold"
                >
                  <ChatBubbleLeftRightIcon className="h-4 w-4 mr-2" />
                  Chat with AI
                </Link>
                <Link
                  to="/dashboard"
                  className="w-full inline-flex justify-center items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-vanderbilt-gold"
                >
                  Back to Dashboard
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlanDetails;