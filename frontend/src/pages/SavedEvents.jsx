import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { 
  CalendarIcon, 
  ClockIcon, 
  CheckCircleIcon, 
  TrashIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  InformationCircleIcon,
  ChatBubbleLeftRightIcon
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleIconSolid } from '@heroicons/react/24/solid';

const SavedEvents = ({ user }) => {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedTasks, setExpandedTasks] = useState(new Set());
  const [renderKey, setRenderKey] = useState(0);
  const [checklistOverrides, setChecklistOverrides] = useState({});

  // Get the effective completed state (considering overrides)
  const getEffectiveCompletedState = (item, originalIndex) => {
    if (!selectedEvent) return item.completed;
    const taskKey = `${selectedEvent._id}-${originalIndex}`;
    const hasOverride = checklistOverrides.hasOwnProperty(taskKey);
    const effectiveState = hasOverride ? checklistOverrides[taskKey] : item.completed;
    console.log('🔍 Getting effective state:', { 
      taskKey, 
      hasOverride, 
      overrideValue: checklistOverrides[taskKey], 
      itemCompleted: item.completed, 
      effectiveState 
    });
    return effectiveState;
  };

  // Function to organize checklist by time periods (for backward compatibility)
  const organizeChecklistByTimePeriods = (checklist, eventDate) => {
    if (!eventDate || !checklist || checklist.length === 0) {
      return checklist;
    }

    // If checklist already has time headers, return as is
    if (checklist.some(item => item.isTimeHeader)) {
      return checklist;
    }

    const eventDateTime = new Date(eventDate);
    
    // Categorize tasks by time periods
    const timePeriods = {
      '6+ months out': [],
      '3-6 months out': [],
      '1-3 months out': [],
      '2-4 weeks out': [],
      '1-2 weeks out': [],
      'Week of event': [],
      'Day of event': [],
      'After event': []
    };
    
    checklist.forEach(task => {
      if (!task.dueDate) {
        // Tasks without due dates go to the earliest applicable period
        timePeriods['3-6 months out'].push(task);
        return;
      }
      
      const dueDate = new Date(task.dueDate);
      const daysUntilEvent = Math.ceil((eventDateTime - dueDate) / (1000 * 60 * 60 * 24));
      
      // Categorize based on how far before the event the task is due
      if (daysUntilEvent >= 180) { // 6+ months
        timePeriods['6+ months out'].push(task);
      } else if (daysUntilEvent >= 90) { // 3-6 months
        timePeriods['3-6 months out'].push(task);
      } else if (daysUntilEvent >= 30) { // 1-3 months
        timePeriods['1-3 months out'].push(task);
      } else if (daysUntilEvent >= 14) { // 2-4 weeks
        timePeriods['2-4 weeks out'].push(task);
      } else if (daysUntilEvent >= 7) { // 1-2 weeks
        timePeriods['1-2 weeks out'].push(task);
      } else if (daysUntilEvent >= 1) { // Week of event
        timePeriods['Week of event'].push(task);
      } else if (daysUntilEvent >= 0) { // Day of event
        timePeriods['Day of event'].push(task);
      } else { // After event
        timePeriods['After event'].push(task);
      }
    });
    
    // Create organized checklist with time period headers
    const organizedChecklist = [];
    
    Object.entries(timePeriods).forEach(([period, tasks]) => {
      if (tasks.length > 0) {
        // Add time period header
        organizedChecklist.push({
          task: `--- ${period.toUpperCase()} ---`,
          isTimeHeader: true,
          timePeriod: period,
          dueDate: null,
          priority: 'medium',
          completed: false
        });
        
        // Sort tasks within the period by priority (critical first) then by due date
        tasks.sort((a, b) => {
          const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
          const aPriority = priorityOrder[a.priority] || 2;
          const bPriority = priorityOrder[b.priority] || 2;
          
          if (aPriority !== bPriority) return aPriority - bPriority;
          
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return new Date(a.dueDate) - new Date(b.dueDate);
        });
        
        // Add the sorted tasks
        organizedChecklist.push(...tasks);
      }
    });
    
    return organizedChecklist;
  };

  // Get organized checklist for display
  const getOrganizedChecklist = (event) => {
    if (!event || !event.checklist) return [];
    return organizeChecklistByTimePeriods(event.checklist, event.eventDate);
  };

  // Toggle task details expansion
  const toggleTaskDetails = (taskId) => {
    const newExpanded = new Set(expandedTasks);
    if (newExpanded.has(taskId)) {
      newExpanded.delete(taskId);
    } else {
      newExpanded.add(taskId);
    }
    setExpandedTasks(newExpanded);
  };

  // Generate enhanced task details
  const getTaskDetails = (task, event) => {
    if (!task || task.isTimeHeader) return null;

    const taskLower = task.task.toLowerCase();
    let details = {
      estimatedTime: getEstimatedTime(taskLower),
      dependencies: getDependencies(taskLower),
      tips: getTips(taskLower, event),
      resources: getResources(taskLower),
      deadlineReason: getDeadlineReason(task, event)
    };

    return details;
  };

  const getEstimatedTime = (taskText) => {
    if (taskText.includes('book') || taskText.includes('reserve')) return '2-3 hours';
    if (taskText.includes('invitation') || taskText.includes('invite')) return '1-2 hours';
    if (taskText.includes('catering') || taskText.includes('food')) return '1-3 hours';
    if (taskText.includes('setup') || taskText.includes('equipment')) return '3-5 hours';
    if (taskText.includes('marketing') || taskText.includes('promotion')) return '2-4 hours';
    if (taskText.includes('budget') || taskText.includes('funding')) return '4-6 hours';
    return '1-2 hours';
  };

  const getDependencies = (taskText) => {
    const dependencies = [];
    if (taskText.includes('invitation')) dependencies.push('Venue must be confirmed', 'Guest list finalized');
    if (taskText.includes('catering')) dependencies.push('Final headcount needed', 'Dietary restrictions collected');
    if (taskText.includes('setup')) dependencies.push('Equipment list confirmed', 'Venue access arranged');
    if (taskText.includes('marketing')) dependencies.push('Event details finalized', 'Approval from administration');
    return dependencies;
  };

  const getTips = (taskText, event) => {
    const tips = [];
    
    if (taskText.includes('book') || taskText.includes('venue')) {
      tips.push('Book popular venues 4-6 weeks in advance');
      tips.push('Confirm AV equipment availability and setup requirements');
      tips.push('Check venue capacity against expected attendance');
    }
    
    if (taskText.includes('invitation')) {
      tips.push('Send invitations 2-3 weeks before the event');
      tips.push('Include RSVP deadline 1 week before event');
      tips.push('Consider dietary restrictions and accessibility needs');
    }
    
    if (taskText.includes('catering')) {
      tips.push('Confirm final headcount 48 hours before event');
      tips.push('Have backup food options for dietary restrictions');
      tips.push('Coordinate delivery time with venue access');
    }
    
    if (taskText.includes('setup')) {
      tips.push('Arrive 2-3 hours early for complex setups');
      tips.push('Test all AV equipment before guests arrive');
      tips.push('Have backup plans for technical issues');
    }

    if (taskText.includes('budget')) {
      tips.push('Include 10-15% buffer for unexpected costs');
      tips.push('Get written quotes from all vendors');
      tips.push('Track expenses in a spreadsheet throughout planning');
    }
    
    return tips;
  };

  const getResources = (taskText) => {
    const resources = [];
    
    if (taskText.includes('venue') || taskText.includes('book')) {
      resources.push('Vanderbilt Event Services: (615) 322-2471');
      resources.push('Campus venue booking system');
      resources.push('Facilities Management for setup requirements');
    }
    
    if (taskText.includes('catering') || taskText.includes('food')) {
      resources.push('Vanderbilt Catering: (615) 322-2641');
      resources.push('Approved external catering vendors list');
      resources.push('Dining Services for on-campus options');
    }
    
    if (taskText.includes('marketing') || taskText.includes('promotion')) {
      resources.push('Student Communications office');
      resources.push('University social media guidelines');
      resources.push('Campus digital signage system');
    }
    
    if (taskText.includes('budget') || taskText.includes('funding')) {
      resources.push('Student Organization funding guidelines');
      resources.push('Finance office: (615) 322-3488');
      resources.push('Reimbursement forms and procedures');
    }
    
    return resources;
  };

  const getDeadlineReason = (task, event) => {
    if (!task.dueDate || !event.eventDate) return null;
    
    const dueDate = new Date(task.dueDate);
    const eventDate = new Date(event.eventDate);
    const daysUntilEvent = Math.ceil((eventDate - dueDate) / (1000 * 60 * 60 * 24));
    
    const taskLower = task.task.toLowerCase();
    
    if (taskLower.includes('venue')) {
      return `Booking ${daysUntilEvent} days early ensures availability and allows time for backup options if needed.`;
    }
    if (taskLower.includes('invitation')) {
      return `Sending invitations ${daysUntilEvent} days early gives guests adequate notice while maintaining interest.`;
    }
    if (taskLower.includes('catering')) {
      return `Finalizing catering ${daysUntilEvent} days early allows for accurate headcount and food preparation.`;
    }
    if (taskLower.includes('setup')) {
      return `Setting up ${daysUntilEvent} days early provides buffer time for troubleshooting any issues.`;
    }
    
    return `This timeline ensures adequate preparation time for a successful event.`;
  };

  useEffect(() => {
    fetchEvents();
  }, [user, eventId]);

  // Handle navigation from Chat component with selectedEventId
  useEffect(() => {
    if (location.state?.selectedEventId && events.length > 0) {
      const targetEvent = events.find(event => event._id === location.state.selectedEventId);
      if (targetEvent) {
        setSelectedEvent(targetEvent);
        // Don't immediately clear state - let it persist for proper navigation
      }
    }
  }, [location.state, events]);

  // Clear expanded tasks and checklist overrides when selectedEvent changes
  useEffect(() => {
    setExpandedTasks(new Set());
    setChecklistOverrides({});
  }, [selectedEvent]);

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

  const toggleChecklistItem = async (displayIndex, originalTask) => {
    console.log('🔄 Toggle checkbox clicked:', { displayIndex, originalTask });
    
    if (!selectedEvent) {
      console.log('❌ No selected event');
      return;
    }

    // Don't allow toggling time headers
    if (originalTask.isTimeHeader) {
      console.log('❌ Cannot toggle time header');
      return;
    }

    try {
      console.log('📋 Current checklist:', selectedEvent.checklist);
      
      // Find the original index of the task in the raw checklist
      const originalIndex = selectedEvent.checklist.findIndex(item => 
        item._id === originalTask._id || 
        (item.task === originalTask.task && item.dueDate === originalTask.dueDate)
      );

      console.log('🔍 Found original index:', originalIndex);
      
      if (originalIndex === -1) {
        console.log('❌ Task not found in checklist');
        return;
      }

      // Create updated checklist with toggled item
      const updatedChecklist = selectedEvent.checklist.map((item, index) => 
        index === originalIndex ? { ...item, completed: !item.completed } : item
      );

      console.log('💾 Updating checklist:', { 
        oldCompleted: selectedEvent.checklist[originalIndex].completed,
        newCompleted: !selectedEvent.checklist[originalIndex].completed 
      });

      // Immediately update the visual state (optimistic update)
      const taskKey = `${selectedEvent._id}-${originalIndex}`;
      const newCompletedState = !selectedEvent.checklist[originalIndex].completed;
      console.log('⚡ Setting optimistic update:', { taskKey, newCompletedState });
      setChecklistOverrides(prev => ({
        ...prev,
        [taskKey]: newCompletedState
      }));

      // Update the event with the new checklist
      const response = await axios.put(`/api/events/${selectedEvent._id}`, {
        ...selectedEvent,
        checklist: updatedChecklist
      });

      console.log('✅ Server response:', response.data);

      // Update local state - force a complete re-render by creating new objects
      const updatedEvent = { ...response.data };
      console.log('🔄 Setting new selected event:', updatedEvent);
      setSelectedEvent(updatedEvent);
      
      // Update the events list
      setEvents(prevEvents => prevEvents.map(event => 
        event._id === updatedEvent._id ? { ...updatedEvent } : event
      ));

      // Clear the override since server update was successful
      console.log('🧹 Clearing override for:', taskKey);
      console.log('📊 Server returned completed state:', updatedEvent.checklist[originalIndex]?.completed);
      
      // Add a small delay before clearing the override to ensure the component has updated
      setTimeout(() => {
        setChecklistOverrides(prev => {
          const newOverrides = { ...prev };
          delete newOverrides[taskKey];
          console.log('🔄 Overrides after clearing (delayed):', newOverrides);
          return newOverrides;
        });
      }, 100);

      // Force a re-render
      setRenderKey(prev => prev + 1);
      console.log('🎉 Checklist item toggled successfully');

    } catch (error) {
      console.error('❌ Failed to update checklist item:', error);
      console.error('Error details:', error.response?.data || error.message);
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

  const handleContinueChat = (event) => {
    console.log('🚀 Navigating to chat with event context:', event.title);
    // Navigate to chat with event context
    navigate('/chat', {
      state: {
        eventContext: {
          eventId: event._id,
          title: event.title,
          description: event.description,
          eventDate: event.eventDate,
          sourceMessage: event.sourceMessage
        }
      }
    });
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
                            {event.checklist?.filter(item => !item.isTimeHeader && item.completed).length || 0}/
                            {event.checklist?.filter(item => !item.isTimeHeader).length || 0} tasks
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
                      {selectedEvent.expectedAttendance && (
                        <span>{selectedEvent.expectedAttendance} attendees</span>
                      )}
                    </div>
                    
                    {/* Continue Chat Button */}
                    <div className="mt-4">
                      <button
                        onClick={() => handleContinueChat(selectedEvent)}
                        className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      >
                        <ChatBubbleLeftRightIcon className="h-4 w-4 mr-2" />
                        Continue Chat
                      </button>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => deleteEvent(selectedEvent._id)}
                    className="text-red-600 hover:text-red-800 p-2"
                    title="Delete event"
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </div>
                
                {/* Event Description */}
                {selectedEvent.description && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    <h3 className="font-medium text-gray-900 mb-2">Description:</h3>
                    <p className="text-gray-700 whitespace-pre-line">
                      {selectedEvent.description}
                    </p>
                  </div>
                )}
              </div>

              {/* Checklist */}
              {selectedEvent.checklist && selectedEvent.checklist.length > 0 && (() => {
                const organizedChecklist = getOrganizedChecklist(selectedEvent);
                const taskCount = organizedChecklist.filter(item => !item.isTimeHeader).length;
                const completedCount = organizedChecklist.filter(item => !item.isTimeHeader && item.completed).length;
                
                return (
                  <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">
                      Checklist ({completedCount}/{taskCount})
                    </h2>
                    <div className="space-y-2" key={`checklist-${selectedEvent._id}-${selectedEvent.updatedAt || Date.now()}`}>
                      {organizedChecklist.map((item, index) => (
                        <div key={`${selectedEvent._id}-${index}-${item.task}-${item.completed}`}>
                          {item.isTimeHeader ? (
                            // Time period header
                            <div className="bg-vanderbilt-gold bg-opacity-10 border-l-4 border-vanderbilt-gold px-4 py-2 mt-6 first:mt-0">
                              <h3 className="font-semibold text-gray-900 text-sm">
                                {item.task.replace(/^---\s*/, '').replace(/\s*---$/, '')}
                              </h3>
                            </div>
                          ) : (
                            // Regular checklist item
                            <div className="ml-4 border-l-2 border-gray-100">
                              <div className="flex items-start space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                                {/* Checkbox for completion */}
                                <div 
                                  className="h-5 w-5 mt-0.5 flex-shrink-0 cursor-pointer"
                                  onClick={(e) => {
                                    console.log('🖱️ CHECKBOX DIV CLICKED!');
                                    e.stopPropagation();
                                    
                                    // Find the original index for this item
                                    const originalIdx = selectedEvent.checklist.findIndex(original => 
                                      original._id === item._id || 
                                      (original.task === item.task && original.dueDate === item.dueDate)
                                    );
                                    
                                    if (originalIdx === -1) {
                                      console.warn('⚠️ Could not find original index for item:', item.task);
                                      return;
                                    }
                                    
                                    toggleChecklistItem(originalIdx, item);
                                  }}
                                >
                                  {(() => {
                                    const originalIdx = selectedEvent.checklist.findIndex(original => 
                                      original._id === item._id || 
                                      (original.task === item.task && original.dueDate === item.dueDate)
                                    );
                                    const effectiveCompleted = getEffectiveCompletedState(item, originalIdx);
                                    
                                    return effectiveCompleted ? (
                                      <CheckCircleIconSolid className="h-full w-full text-green-600 hover:text-green-700 transition-colors" />
                                    ) : (
                                      <CheckCircleIcon className="h-full w-full text-gray-300 hover:text-gray-500 transition-colors" />
                                    );
                                  })()}
                                </div>
                                
                                {/* Task content */}
                                <div className="flex-1">
                                  <div className="flex items-center justify-between">
                                    {(() => {
                                      const originalIdx = selectedEvent.checklist.findIndex(original => 
                                        original._id === item._id || 
                                        (original.task === item.task && original.dueDate === item.dueDate)
                                      );
                                      const effectiveCompleted = getEffectiveCompletedState(item, originalIdx);
                                      
                                      return (
                                        <p className={`transition-all ${effectiveCompleted ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                                          {item.task}
                                        </p>
                                      );
                                    })()}
                                    
                                    {/* Details toggle button */}
                                    <button
                                      onClick={() => toggleTaskDetails(item._id || `${index}-${item.task}`)}
                                      className="ml-2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                                      title="View details"
                                    >
                                      {expandedTasks.has(item._id || `${index}-${item.task}`) ? (
                                        <ChevronDownIcon className="h-4 w-4" />
                                      ) : (
                                        <ChevronRightIcon className="h-4 w-4" />
                                      )}
                                    </button>
                                  </div>
                                  
                                  {item.description && (
                                    <p className="text-sm text-gray-500 mt-1">{item.description}</p>
                                  )}
                                  
                                  <div className="flex items-center space-x-4 mt-2">
                                    {item.dueDate && (
                                      <p className="text-xs text-gray-400">
                                        Due: {new Date(item.dueDate).toLocaleDateString()}
                                      </p>
                                    )}
                                    {item.priority && item.priority !== 'medium' && (
                                      <span className={`px-2 py-1 text-xs rounded-full ${getPriorityColor(item.priority)}`}>
                                        {item.priority}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              
                              {/* Expandable task details */}
                              {expandedTasks.has(item._id || `${index}-${item.task}`) && (() => {
                                const taskDetails = getTaskDetails(item, selectedEvent);
                                if (!taskDetails) return null;
                                
                                return (
                                  <div className="ml-8 pb-4 border-l border-gray-200 pl-4">
                                    <div className="bg-blue-50 rounded-lg p-4 space-y-4">
                                      
                                      {/* Estimated Time */}
                                      <div>
                                        <h4 className="flex items-center text-sm font-medium text-gray-900 mb-2">
                                          <ClockIcon className="h-4 w-4 mr-1 text-blue-600" />
                                          Estimated Time
                                        </h4>
                                        <p className="text-sm text-gray-700">{taskDetails.estimatedTime}</p>
                                      </div>

                                      {/* Dependencies */}
                                      {taskDetails.dependencies.length > 0 && (
                                        <div>
                                          <h4 className="flex items-center text-sm font-medium text-gray-900 mb-2">
                                            <CheckCircleIcon className="h-4 w-4 mr-1 text-orange-600" />
                                            Dependencies
                                          </h4>
                                          <ul className="text-sm text-gray-700 space-y-1">
                                            {taskDetails.dependencies.map((dep, depIndex) => (
                                              <li key={depIndex} className="flex items-start">
                                                <span className="text-orange-600 mr-2">•</span>
                                                {dep}
                                              </li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}

                                      {/* Tips */}
                                      {taskDetails.tips.length > 0 && (
                                        <div>
                                          <h4 className="flex items-center text-sm font-medium text-gray-900 mb-2">
                                            <InformationCircleIcon className="h-4 w-4 mr-1 text-green-600" />
                                            Tips & Best Practices
                                          </h4>
                                          <ul className="text-sm text-gray-700 space-y-1">
                                            {taskDetails.tips.map((tip, tipIndex) => (
                                              <li key={tipIndex} className="flex items-start">
                                                <span className="text-green-600 mr-2">•</span>
                                                {tip}
                                              </li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}

                                      {/* Resources */}
                                      {taskDetails.resources.length > 0 && (
                                        <div>
                                          <h4 className="flex items-center text-sm font-medium text-gray-900 mb-2">
                                            <CalendarIcon className="h-4 w-4 mr-1 text-purple-600" />
                                            Resources & Contacts
                                          </h4>
                                          <ul className="text-sm text-gray-700 space-y-1">
                                            {taskDetails.resources.map((resource, resourceIndex) => (
                                              <li key={resourceIndex} className="flex items-start">
                                                <span className="text-purple-600 mr-2">•</span>
                                                {resource}
                                              </li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}

                                      {/* Deadline Reason */}
                                      {taskDetails.deadlineReason && (
                                        <div>
                                          <h4 className="flex items-center text-sm font-medium text-gray-900 mb-2">
                                            <InformationCircleIcon className="h-4 w-4 mr-1 text-indigo-600" />
                                            Why This Timing?
                                          </h4>
                                          <p className="text-sm text-gray-700 italic">{taskDetails.deadlineReason}</p>
                                        </div>
                                      )}
                                      
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

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