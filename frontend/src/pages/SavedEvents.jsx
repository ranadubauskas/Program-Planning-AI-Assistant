import {
  CalendarIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  InformationCircleIcon,
  PencilSquareIcon,
  TrashIcon,
  UsersIcon
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleIconSolid } from '@heroicons/react/24/solid';
import axios from 'axios';
import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import remarkGfm from 'remark-gfm';

const copyToClipboard = async (text, successMsg = 'Link copied to clipboard!') => {
  try {
    await navigator.clipboard.writeText(text);
    alert(successMsg);
  } catch (e) {
    console.error('Clipboard copy failed, showing manual prompt:', e);
    // Fallback prompt so the user can copy manually
    window.prompt('Copy this link:', text);
  }
};

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
  const [shareModal, setShareModal] = useState({ open: false, link: '' });
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState('');
  const [collaborationModal, setCollaborationModal] = useState({ open: false, link: '', eventId: null });

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

  // Helper function to calculate date ranges for time periods
  const calculateDateRange = (eventDateTime, daysBack, maxDaysBack = null) => {
    const startDate = new Date(eventDateTime);
    const endDate = new Date(eventDateTime);
    
    startDate.setDate(startDate.getDate() - (maxDaysBack || daysBack));
    endDate.setDate(endDate.getDate() - daysBack);
    
    const formatDate = (date) => {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric'
      });
    };
    
    if (maxDaysBack && maxDaysBack !== daysBack) {
      return `${formatDate(startDate)} - ${formatDate(endDate)}`;
    } else {
      return formatDate(endDate);
    }
  };

  // Function to organize checklist by time periods (for backward compatibility)
  const organizeChecklistByTimePeriods = (checklist, eventDate) => {
    if (!eventDate || !checklist || checklist.length === 0) {
      return checklist;
    }

    // If checklist already has time headers, we need to reorganize to add date ranges
    // Remove existing time headers and reorganize with new ones that include dates
    const tasksOnly = checklist.filter(item => !item.isTimeHeader);

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
    
    tasksOnly.forEach(task => {
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
        // Calculate date range for this period
        let dateRange = '';
        let periodText = period.toUpperCase();
        
        switch (period) {
          case '6+ months out':
            dateRange = calculateDateRange(eventDateTime, 180, 365);
            break;
          case '3-6 months out':
            dateRange = calculateDateRange(eventDateTime, 90, 180);
            break;
          case '1-3 months out':
            dateRange = calculateDateRange(eventDateTime, 30, 90);
            break;
          case '2-4 weeks out':
            dateRange = calculateDateRange(eventDateTime, 14, 28);
            break;
          case '1-2 weeks out':
            dateRange = calculateDateRange(eventDateTime, 7, 14);
            break;
          case 'Week of event':
            dateRange = calculateDateRange(eventDateTime, 1, 7);
            break;
          case 'Day of event':
            dateRange = calculateDateRange(eventDateTime, 0);
            break;
          case 'After event':
            periodText = 'AFTER EVENT';
            dateRange = 'Post-event tasks';
            break;
        }
        
        // Add time period header with date range
        const headerText = dateRange && dateRange !== 'Post-event tasks' 
          ? `--- ${periodText} (${dateRange}) ---`
          : `--- ${periodText} ---`;
          
        organizedChecklist.push({
          task: headerText,
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
    const taskLower = taskText.toLowerCase();
    const eventType = event?.eventType || 'other';
    const isDayOfEvent = taskLower.includes('day of') || taskLower.includes('event day') || taskLower.includes('execution') || taskLower.includes('coordination') || taskLower.includes('arrive early');
    
    // Event-type-specific tips for day-of-event tasks
    if (isDayOfEvent) {
      if (eventType === 'mixer') {
        tips.push('Set up name tags and welcome station 30 minutes before start');
        tips.push('Prepare icebreaker activities and networking materials');
        tips.push('Coordinate refreshments station with catering team');
        tips.push('Have a greeting area with event information');
      } else if (eventType === 'concert') {
        tips.push('Conduct sound check 2 hours before doors open');
        tips.push('Coordinate with performers for arrival and setup times');
        tips.push('Set up ticketing/check-in station near entrance');
        tips.push('Test stage lighting and audio equipment');
        tips.push('Coordinate security and crowd management');
      } else if (eventType === 'workshop') {
        tips.push('Set up registration table 45 minutes before start');
        tips.push('Prepare handouts and materials at each seat');
        tips.push('Test presentation equipment and screens');
        tips.push('Arrange breakout rooms if needed');
        tips.push('Brief facilitators on agenda and timing');
      } else if (eventType === 'lecture') {
        tips.push('Set up podium and microphone 1 hour before');
        tips.push('Test recording equipment if recording');
        tips.push('Prepare Q&A setup and microphones for audience');
        tips.push('Test slides and presentation technology');
        tips.push('Prepare speaker introduction materials');
      } else if (eventType === 'meeting') {
        tips.push('Distribute agenda and materials 15 minutes before');
        tips.push('Set up conference call or video link if remote participants');
        tips.push('Prepare document sharing platform');
        tips.push('Configure room layout for meeting type');
        tips.push('Set up note-taking system');
      } else if (eventType === 'social') {
        tips.push('Set up decorations and ambiance 1 hour before');
        tips.push('Prepare entertainment area and equipment');
        tips.push('Set up photo booth or activity stations');
        tips.push('Coordinate guest check-in and welcome');
        tips.push('Prepare refreshment stations throughout venue');
      } else if (eventType === 'academic') {
        tips.push('Set up presentation materials and research displays');
        tips.push('Prepare discussion prompts and evaluation forms');
        tips.push('Test all technology and accessibility features');
        tips.push('Arrange seating for optimal discussion');
        tips.push('Prepare handouts and reference materials');
      } else {
        tips.push('Arrive 2-3 hours early for complex setups');
        tips.push('Test all equipment before guests arrive');
        tips.push('Have backup plans for technical issues');
      }
    } else {
      // General tips for non-day-of-event tasks
      if (taskLower.includes('book') || taskLower.includes('venue')) {
        tips.push('Book popular venues 4-6 weeks in advance');
        tips.push('Confirm AV equipment availability and setup requirements');
        tips.push('Check venue capacity against expected attendance');
      }
      
      if (taskLower.includes('invitation')) {
        tips.push('Send invitations 2-3 weeks before the event');
        tips.push('Include RSVP deadline 1 week before event');
        tips.push('Consider dietary restrictions and accessibility needs');
      }
      
      if (taskLower.includes('catering')) {
        tips.push('Confirm final headcount 48 hours before event');
        tips.push('Have backup food options for dietary restrictions');
        tips.push('Coordinate delivery time with venue access');
      }
      
      if (taskLower.includes('setup')) {
        tips.push('Arrive 2-3 hours early for complex setups');
        tips.push('Test all AV equipment before guests arrive');
        tips.push('Have backup plans for technical issues');
      }

      if (taskLower.includes('budget')) {
        tips.push('Include 10-15% buffer for unexpected costs');
        tips.push('Get written quotes from all vendors');
        tips.push('Track expenses in a spreadsheet throughout planning');
      }
    }
    
    return tips;
  };

  const getResources = (taskText) => {
    const resources = [];
    
    if (taskText.includes('venue') || taskText.includes('book') || taskText.includes('reserve') || taskText.includes('space')) {
      resources.push('Vanderbilt Event Services: (615) 322-2471');
      resources.push({
        type: 'link',
        text: 'EMS Web App - Book a Space',
        url: 'https://emscampus.app.vanderbilt.edu/EMSWebApp/'
      });
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
    const timingType = task.timingType || 'recommended';
    const isRequired = timingType === 'required';
    
    const taskLower = task.task.toLowerCase();
    
    let reason = '';
    if (taskLower.includes('venue')) {
      reason = `Booking ${daysUntilEvent} days early ensures availability and allows time for backup options if needed.`;
    } else if (taskLower.includes('invitation')) {
      reason = `Sending invitations ${daysUntilEvent} days early gives guests adequate notice while maintaining interest.`;
    } else if (taskLower.includes('catering')) {
      reason = `Finalizing catering ${daysUntilEvent} days early allows for accurate headcount and food preparation.`;
    } else if (taskLower.includes('setup')) {
      reason = `Setting up ${daysUntilEvent} days early provides buffer time for troubleshooting any issues.`;
    } else {
      reason = `This timeline ensures adequate preparation time for a successful event.`;
    }
    
    if (isRequired) {
      return `${reason} This is a required deadline based on policy or contract requirements.`;
    } else {
      return `${reason} This is a recommended timeline for optimal planning.`;
    }
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
    setEditingNotes(false);
    setNotesText(selectedEvent?.notes || '');
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

  const shareEvent = async (event) => {
    try {
      const resp = await axios.post(`/api/events/${event._id}/share`);
      const { shareUrl } = resp.data;
      setShareModal({ open: true, link: shareUrl });
    } catch (error) {
      console.error('Error creating share link:', error);
      alert('Failed to create share link. Please try again.');
    }
  };

  const enableCollaboration = async (event) => {
    try {
      const resp = await axios.post(`/api/events/${event._id}/collaboration/enable`);
      const { collaborationUrl } = resp.data;
      setCollaborationModal({ open: true, link: collaborationUrl, eventId: event._id });
      // Refresh the event to get updated collaboration status
      fetchEvents();
    } catch (error) {
      console.error('Error enabling collaboration:', error);
      alert('Failed to enable collaboration. Please try again.');
    }
  };

  const disableCollaboration = async (event) => {
    if (!window.confirm('Are you sure you want to disable collaboration? This will remove all collaborators and their access.')) {
      return;
    }
    
    try {
      await axios.post(`/api/events/${event._id}/collaboration/disable`);
      alert('Collaboration has been disabled for this event.');
      // Refresh the event to get updated collaboration status
      fetchEvents();
    } catch (error) {
      console.error('Error disabling collaboration:', error);
      alert('Failed to disable collaboration. Please try again.');
    }
  };

  const openCollaborativeEvent = (event) => {
    if (event.collaborationId) {
      window.open(`/collaborate/${event.collaborationId}`, '_blank');
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

      // Get the CURRENT effective state (including any optimistic updates)
      const currentEffectiveState = getEffectiveCompletedState(selectedEvent.checklist[originalIndex], originalIndex);
      const newCompletedState = !currentEffectiveState;

      console.log('💾 Toggle operation:', { 
        databaseCompleted: selectedEvent.checklist[originalIndex].completed,
        currentEffectiveState: currentEffectiveState,
        newTargetState: newCompletedState
      });

      // Create updated checklist with toggled item based on effective state
      const updatedChecklist = selectedEvent.checklist.map((item, index) => 
        index === originalIndex ? { ...item, completed: newCompletedState } : item
      );

      // Special debug for uncheck operations
      if (currentEffectiveState === true) {
        console.log('🔓 UNCHECK OPERATION DETECTED - item is currently checked (effective), trying to uncheck');
        console.log('🔓 Before uncheck - current overrides:', checklistOverrides);
      } else {
        console.log('✅ CHECK OPERATION DETECTED - item is currently unchecked (effective), trying to check');
      }

      // Immediately update the visual state (optimistic update)
      const taskKey = `${selectedEvent._id}-${originalIndex}`;
      console.log('⚡ Setting optimistic update:', { taskKey, newCompletedState });
      setChecklistOverrides(prev => ({
        ...prev,
        [taskKey]: newCompletedState
      }));

      // Debug: Log what we're actually sending for uncheck operations
      const requestPayload = {
        ...selectedEvent,
        checklist: updatedChecklist
      };
      
      if (currentEffectiveState === true) {
        console.log('🔓 SENDING UNCHECK REQUEST:');
        console.log('🔓 Updated item in request:', updatedChecklist[originalIndex]);
        console.log('🔓 Full request checklist length:', updatedChecklist.length);
      }

      // Update the event with the new checklist
      const response = await axios.put(`/api/events/${selectedEvent._id}`, requestPayload);

      console.log('✅ Server response:', response.data);

      // Special debug for uncheck operations - check server response
      if (currentEffectiveState === true) {
        console.log('🔓 UNCHECK SERVER RESPONSE:');
        console.log('🔓 Server returned checklist item:', response.data.checklist[originalIndex]);
        console.log('🔓 Expected completed: false, Got completed:', response.data.checklist[originalIndex]?.completed);
      }

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
      
      // Clear the override immediately since server state is now updated
      setChecklistOverrides(prev => {
        const newOverrides = { ...prev };
        delete newOverrides[taskKey];
        console.log('🔄 Overrides after clearing (immediate):', newOverrides);
        return newOverrides;
      });

      // Force a re-render
      setRenderKey(prev => prev + 1);
      console.log('🎉 Checklist item toggled successfully');

    } catch (error) {
      console.error('❌ Failed to update checklist item:', error);
      console.error('Error details:', error.response?.data || error.message);
      
      // Clear the optimistic update on error
      const taskKey = `${selectedEvent._id}-${originalIndex}`;
      setChecklistOverrides(prev => {
        const newOverrides = { ...prev };
        delete newOverrides[taskKey];
        return newOverrides;
      });
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
                    className={`p-4 rounded-lg border transition-all ${
                      selectedEvent?._id === event._id
                        ? 'border-vanderbilt-gold bg-yellow-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0 pr-3">
                        <div className="flex items-center space-x-2 cursor-pointer" onClick={() => setSelectedEvent(event)}>
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
                        <div className="flex flex-col items-end space-y-2 flex-shrink-0" style={{minWidth: '100px'}}>
                        <button
                          onClick={() => setSelectedEvent(event)}
                          className="px-3 py-1 text-xs rounded-md border border-gray-300 text-gray-700 bg-white hover:bg-gray-50"
                        >
                          View
                        </button>
      
                        {event.collaborationEnabled ? (
                          <div className="flex flex-col space-y-1">
                            <button
                              onClick={() => openCollaborativeEvent(event)}
                              className="px-3 py-1 text-xs rounded-md border border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100"
                              title="Open collaborative editing"
                            >
                              <UsersIcon className="h-3 w-3 inline mr-1" />
                              Enable Collaboration
                            </button>
                            <button
                              onClick={() => disableCollaboration(event)}
                              className="px-3 py-1 text-xs rounded-md border border-red-300 text-red-700 bg-red-50 hover:bg-red-100"
                              title="Disable collaboration"
                            >
                              Disable Collaboration
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => enableCollaboration(event)}
                            className="px-3 py-1 text-xs rounded-md border border-green-300 text-green-700 bg-green-50 hover:bg-green-100"
                            title="Enable collaboration"
                          >
                            <UsersIcon className="h-3 w-3 inline mr-1" />
                            Collaborate
                          </button>
                        )}
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
                    
                    {/* Notifications toggle */}
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <label className="text-sm text-gray-700">Email reminders:</label>
                      <button
                        onClick={async () => {
                          try {
                            const response = await axios.put(`/api/events/${selectedEvent._id}`, {
                              notifications: { 
                                emailOptIn: !(selectedEvent.notifications?.emailOptIn !== false),
                                reminderDays: selectedEvent.notifications?.reminderDays || 5
                              }
                            });
                            setSelectedEvent(response.data);
                            setEvents(prev => prev.map(e => e._id === response.data._id ? response.data : e));
                          } catch (e) {
                            alert('Failed to update notification preference');
                          }
                        }}
                        className={`px-3 py-1 text-sm rounded-md border ${selectedEvent.notifications?.emailOptIn !== false ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-700 border-gray-200'}`}
                      >
                        {selectedEvent.notifications?.emailOptIn !== false ? 'On' : 'Off'}
                      </button>
                      {selectedEvent.notifications?.emailOptIn !== false && (
                        <>
                          <label className="text-sm text-gray-700">Days before due:</label>
                          <select
                            value={selectedEvent.notifications?.reminderDays || 5}
                            onChange={async (e) => {
                              try {
                                const reminderDays = parseInt(e.target.value);
                                const response = await axios.put(`/api/events/${selectedEvent._id}`, {
                                  notifications: { 
                                    emailOptIn: true,
                                    reminderDays: reminderDays
                                  }
                                });
                                setSelectedEvent(response.data);
                                setEvents(prev => prev.map(ev => ev._id === response.data._id ? response.data : ev));
                              } catch (error) {
                                alert('Failed to update reminder timing');
                              }
                            }}
                            className="px-2 py-1 text-sm border border-gray-300 rounded-md bg-white"
                          >
                            <option value="1">1 day</option>
                            <option value="2">2 days</option>
                            <option value="3">3 days</option>
                            <option value="5">5 days</option>
                            <option value="7">7 days</option>
                            <option value="10">10 days</option>
                            <option value="14">14 days</option>
                          </select>
                        </>
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

                {/* Contact Information */}
                <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <h3 className="font-medium text-gray-900 mb-3">Contact Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="font-medium text-gray-700">Event Services:</span>
                      <div className="mt-1">
                        <a href="mailto:events@vanderbilt.edu" className="text-blue-600 hover:underline">events@vanderbilt.edu</a>
                        <span className="text-gray-500 ml-2">(615) 322-2471</span>
                      </div>
                    </div>
                    {(selectedEvent.cateringRequired || selectedEvent.eventType === 'mixer' || selectedEvent.eventType === 'social') && (
                      <div>
                        <span className="font-medium text-gray-700">Catering:</span>
                        <div className="mt-1">
                          <a href="mailto:catering@vanderbilt.edu" className="text-blue-600 hover:underline">catering@vanderbilt.edu</a>
                          <span className="text-gray-500 ml-2">(615) 322-2641</span>
                        </div>
                      </div>
                    )}
                    {(selectedEvent.requiresAV || selectedEvent.eventType === 'lecture' || selectedEvent.eventType === 'workshop' || selectedEvent.eventType === 'concert') && (
                      <div>
                        <span className="font-medium text-gray-700">IT/AV Support:</span>
                        <div className="mt-1">
                          <a href="mailto:it@vanderbilt.edu" className="text-blue-600 hover:underline">it@vanderbilt.edu</a>
                        </div>
                      </div>
                    )}
                    <div>
                      <span className="font-medium text-gray-700">Finance:</span>
                      <div className="mt-1">
                        <a href="mailto:finance@vanderbilt.edu" className="text-blue-600 hover:underline">finance@vanderbilt.edu</a>
                        <span className="text-gray-500 ml-2">(615) 322-3488</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Freedom of Expression Policy Information */}
                {selectedEvent.potentiallyControversial && (
                  <div className="mt-4 p-4 bg-amber-50 rounded-lg border border-amber-200">
                    <h3 className="font-medium text-gray-900 mb-3 flex items-center">
                      <InformationCircleIcon className="h-5 w-5 mr-2 text-amber-600" />
                      Freedom of Expression Policy Information
                    </h3>
                    <div className="text-sm text-gray-700 space-y-3">
                      <p className="font-medium">
                        Since this event may be considered controversial, please review Vanderbilt's Freedom of Expression policies:
                      </p>
                      
                      <div>
                        <h4 className="font-medium text-gray-900 mb-1">Key Policy Points:</h4>
                        <ul className="list-disc list-inside space-y-1 ml-2">
                          <li>Vanderbilt is committed to freedom of expression and will maintain conditions of freedom of inquiry, thought, and discussion on campus.</li>
                          <li>Students are expected to be respectful and contribute positively to orderly and civil exchange of diverse ideas.</li>
                          <li>Freedom of expression applies even when expression challenges the beliefs of others or may be deemed disagreeable or offensive.</li>
                          <li>When ideas conflict, the response should be to engage in discussion, debate, and mutually respectful dialogue.</li>
                        </ul>
                      </div>

                      <div>
                        <h4 className="font-medium text-gray-900 mb-1">Planning Requirements:</h4>
                        <ul className="list-disc list-inside space-y-1 ml-2">
                          <li>Contact the Vice Provost and Dean of Students at least 48 hours prior to the event for assistance with planning.</li>
                          <li>Demonstrations, Protests, and Counterprotests should be submitted with time, date, and location details.</li>
                          <li>The University may require changes to time, location, or manner if the activity would disrupt campus operations, impede traffic, violate policies, or infringe on others' rights.</li>
                          <li>Only Registered Student Organizations and University departments may reserve space for Expression activities on campus.</li>
                        </ul>
                      </div>

                      <div>
                        <h4 className="font-medium text-gray-900 mb-1">Prohibited Locations:</h4>
                        <ul className="list-disc list-inside space-y-1 ml-2">
                          <li>Private offices, residences, research laboratories, computer centers</li>
                          <li>Areas with valuable or sensitive materials, collections, or records</li>
                          <li>Classrooms, practice rooms, or spaces where academic courses are being held</li>
                          <li>Residential areas during quiet hours</li>
                          <li>Student Health Center, Counseling Center, and other administrative offices where student privacy is paramount</li>
                        </ul>
                      </div>

                      <div className="mt-3 pt-3 border-t border-amber-300">
                        <p className="text-xs text-gray-600">
                          <strong>Note:</strong> Organizers and participants are responsible for knowing and abiding by University policies as well as local, state, and federal laws. 
                          The University reserves the right to relocate or terminate Expression that disrupts campus operations, impedes traffic, violates policies, or infringes on others' rights.
                        </p>
                        <a 
                          href="https://studenthandbook.vanderbilt.edu/administrative-policies#882" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline text-xs mt-2 inline-block"
                        >
                          View Full Freedom of Expression Policy →
                        </a>
                      </div>
                    </div>
                  </div>
                )}
              </div>

               {/* Notes Section */}
              <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">Notes</h2>
                  {!editingNotes && (
                    <button
                      onClick={() => {
                        setEditingNotes(true);
                        setNotesText(selectedEvent.notes || '');
                      }}
                      className="inline-flex items-center px-3 py-1 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      <PencilSquareIcon className="h-4 w-4 mr-1" />
                      {selectedEvent.notes ? 'Edit Notes' : 'Add Notes'}
                    </button>
                  )}
                </div>
                {editingNotes ? (
                  <div>
                    <textarea
                      value={notesText}
                      onChange={(e) => setNotesText(e.target.value)}
                      placeholder="Add your notes about this event..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-vanderbilt-gold focus:border-vanderbilt-gold resize-none"
                      rows="6"
                    />
                    <div className="mt-3 flex items-center justify-end space-x-2">
                      <button
                        onClick={async () => {
                          try {
                            const response = await axios.put(`/api/events/${selectedEvent._id}`, {
                              notes: notesText
                            });
                            setSelectedEvent(response.data);
                            setEvents(prev => prev.map(e => e._id === response.data._id ? response.data : e));
                            setEditingNotes(false);
                          } catch (error) {
                            alert('Failed to save notes');
                          }
                        }}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setEditingNotes(false);
                          setNotesText(selectedEvent.notes || '');
                        }}
                        className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-50 p-4 rounded-lg min-h-[100px]">
                    {selectedEvent.notes ? (
                      <p className="text-gray-700 whitespace-pre-line">{selectedEvent.notes}</p>
                    ) : (
                      <p className="text-gray-400 italic">No notes yet. Click "Add Notes" to add your own notes about this event.</p>
                    )}
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
                                    e.stopPropagation();
                                    
                                    // Find the original index for this item
                                    const originalIdx = selectedEvent.checklist.findIndex(original => 
                                      original._id === item._id || 
                                      (original.task === item.task && original.dueDate === item.dueDate)
                                    );
                                    
                                    if (originalIdx === -1) return;
                                    
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
                                  
                                  <div className="flex items-center space-x-4 mt-2 flex-wrap gap-2">
                                    {item.dueDate && (
                                      <p className="text-xs text-gray-400">
                                        Due: {new Date(item.dueDate).toLocaleDateString()}
                                      </p>
                                    )}
                                    {item.timingType && (
                                      <span className={`px-2 py-1 text-xs rounded-full ${
                                        item.timingType === 'required' 
                                          ? 'bg-red-100 text-red-700 border border-red-200' 
                                          : 'bg-blue-100 text-blue-700 border border-blue-200'
                                      }`}>
                                        {item.timingType === 'required' ? 'Required' : 'Recommended'}
                                      </span>
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
                                const taskLower = item.task.toLowerCase();
                                
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
                                                {typeof resource === 'object' && resource.type === 'link' ? (
                                                  <a 
                                                    href={resource.url} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    className="text-blue-600 hover:underline"
                                                  >
                                                    {resource.text}
                                                  </a>
                                                ) : (
                                                  resource
                                                )}
                                              </li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}

                                      {/* Video Tutorial for Booking Tasks */}
                                      {(taskLower.includes('venue') || taskLower.includes('book') || taskLower.includes('reserve') || taskLower.includes('space')) && (
                                        <div>
                                          <h4 className="flex items-center text-sm font-medium text-gray-900 mb-2">
                                            <InformationCircleIcon className="h-4 w-4 mr-1 text-blue-600" />
                                            Video Tutorial: How to Book a Space
                                          </h4>
                                          <div className="mt-2 relative w-full" style={{ paddingBottom: '56.25%' }}>
                                            <iframe
                                              src="https://cdnapisec.kaltura.com/html5/html5lib/v2.91/mwEmbedFrame.php/p/1821441/uiconf_id/41615771/entry_id/1_ecu074uq?wid=_1821441&iframeembed=true&playerId=kaltura_player&entry_id=1_ecu074uq&flashvars%5BstreamerType%5D=auto&flashvars%5BlocalizationCode%5D=en&flashvars%5BleadWithHTML5%5D=true&flashvars%5BsideBarContainer.plugin%5D=true&flashvars%5BsideBarContainer.position%5D=left&flashvars%5BsideBarContainer.clickToClose%5D=true&flashvars%5Bchapters.plugin%5D=true&flashvars%5Bchapters.layout%5D=vertical&flashvars%5Bchapters.thumbnailRotator%5D=false&flashvars%5BstreamSelector.plugin%5D=true&flashvars%5BEmbedPlayer.SpinnerTarget%5D=videoHolder&flashvars%5BdualScreen.plugin%5D=true&flashvars%5BKaltura.addCrossoriginToIframe%5D=true&&wid=1_h96d3gnv"
                                              className="absolute top-0 left-0 w-full h-full rounded-lg"
                                              frameBorder="0"
                                              allowFullScreen
                                              title="How to Book a Space at Vanderbilt"
                                            />
                                          </div>
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
                    <div className="prose prose-sm max-w-none break-words">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
                        {selectedEvent.sourceMessage.content}
                      </ReactMarkdown>
                    </div>
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

      {/* Share Modal */}
      {shareModal.open && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900">Share this event</h3>
            <p className="text-sm text-gray-600 mt-1">Anyone with this link can view the event.</p>
            <div className="mt-4">
              <input
                type="text"
                readOnly
                value={shareModal.link}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-800 bg-gray-50"
                onFocus={(e) => e.target.select()}
              />
              <div className="mt-3 flex items-center justify-end space-x-2">
                <button
                  onClick={() => copyToClipboard(shareModal.link)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md"
                >
                  Copy link
                </button>
                <a
                  href={shareModal.link}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-medium rounded-md"
                >
                  Open link
                </a>
                <button
                  onClick={() => setShareModal({ open: false, link: '' })}
                  className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-md"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Collaboration Modal */}
      {collaborationModal.open && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900">Collaboration Enabled!</h3>
            <p className="text-sm text-gray-600 mt-1">Anyone with this link can edit this event collaboratively.</p>
            <div className="mt-4">
              <input
                type="text"
                readOnly
                value={collaborationModal.link}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-800 bg-gray-50"
                onFocus={(e) => e.target.select()}
              />
              <div className="mt-3 flex items-center justify-end space-x-2">
                <button
                  onClick={() => copyToClipboard(collaborationModal.link)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md"
                >
                  Copy link
                </button>
                <a
                  href={collaborationModal.link}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-medium rounded-md"
                >
                  Open collaboration
                </a>
                <button
                  onClick={() => setCollaborationModal({ open: false, link: '', eventId: null })}
                  className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-md"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SavedEvents;