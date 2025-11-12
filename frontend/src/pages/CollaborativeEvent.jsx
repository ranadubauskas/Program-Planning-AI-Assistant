import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  CheckCircleIcon, 
  UsersIcon, 
  ClockIcon, 
  ExclamationTriangleIcon,
  PlusIcon,
  XMarkIcon,
  ShareIcon,
  Cog6ToothIcon,
  CalendarIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  InformationCircleIcon,
  ChatBubbleLeftRightIcon
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleIconSolid } from '@heroicons/react/24/solid';

const CollaborativeEvent = ({ user }) => {
  const { collaborationId } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasJoined, setHasJoined] = useState(false);
  const [activityLog, setActivityLog] = useState([]);
  const [showActivity, setShowActivity] = useState(false);
  const [showCollaborators, setShowCollaborators] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState(new Set());
  const pollRef = useRef(null);
  const [showShare, setShowShare] = useState(false);
  const [invite, setInvite] = useState({ firstName: '', lastName: '', email: '', permission: 'edit' });
  const [shareLink, setShareLink] = useState('');
  const [identity, setIdentity] = useState({
    userId: user?._id || null,
    email: (user?.email || '').trim().toLowerCase() || '',
    userName: user ? `${user.firstName} ${user.lastName}` : ''
  });


  
  // Join form state
  const [joinForm, setJoinForm] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || ''
  });

  // Collaborator management
  const [newCollaborator, setNewCollaborator] = useState({
    firstName: '',
    lastName: '',
    email: '',
    permission: 'edit'
  });
  const [showAddCollaborator, setShowAddCollaborator] = useState(false);

  useEffect(() => {
    loadEvent();
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [collaborationId]);

  // --- loadEvent ---
const loadEvent = async () => {
  const norm = (e) => (e || '').trim().toLowerCase();
  try {
    const response = await axios.get(`/api/collaborate/${collaborationId}`);
    const ev = response.data;
    setEvent(ev);

    // If we have an app-authenticated user, refresh identity from it
    if (user) {
      setIdentity({
        userId: user._id || null,
        email: norm(user.email),
        userName: `${user.firstName} ${user.lastName}`.trim(),
      });
    }

    // Check join status
    if (user) {
      const isOwner = String(ev.owner || ev.userId) === String(user._id);
      const isCollaborator = (ev.collaborators || []).some(
        (c) => String(c.userId) === String(user._id) || norm(c.email) === norm(user.email)
      );
      setHasJoined(isOwner || isCollaborator);
    }

    // Start polling for updates
    if (!pollRef.current) {
      pollRef.current = setInterval(() => {
        loadEventSilently();
      }, 5000);
    }
  } catch (error) {
    console.error('Error loading collaborative event:', error);
    if (error.response?.status === 404) {
      setError('Collaborative event not found or collaboration has been disabled.');
    } else {
      setError('Failed to load collaborative event. Please try again.');
    }
  } finally {
    setLoading(false);
  }
};

const copyShareLink = async () => {
  if (!shareLink) return;
  try {
    await navigator.clipboard.writeText(shareLink);
    alert('Link copied to clipboard!');
  } catch (e) {
    console.error('Clipboard error:', e);
    alert('Could not copy link. Please copy it manually.');
  }
};

  const loadEventSilently = async () => {
    try {
      const response = await axios.get(`/api/collaborate/${collaborationId}`);
      setEvent(response.data);
    } catch (error) {
      // Silent fail for polling
      console.error('Polling error:', error);
    }
  };

  const loadActivityLog = async () => {
    try {
      const response = await axios.get(`/api/collaborate/${collaborationId}/activity`);
      setActivityLog(response.data.activityLog);
    } catch (error) {
      console.error('Error loading activity log:', error);
    }
  };

 // --- joinCollaboration ---
const joinCollaboration = async (e) => {
  e.preventDefault();
  const norm = (x) => (x || '').trim().toLowerCase();

  try {
    await axios.post(`/api/collaborate/${collaborationId}/join`, {
      userId: user?._id,
      firstName: joinForm.firstName,
      lastName: joinForm.lastName,
      email: joinForm.email,
    });

    // Persist a local identity so future edits always include an identifier
    setIdentity({
      userId: user?._id || null,
      email: norm(joinForm.email),
      userName: `${joinForm.firstName} ${joinForm.lastName}`.trim(),
    });

    setHasJoined(true);
    await loadEvent(); // ensure server saved collaborator before first edit
  } catch (error) {
    console.error('Error joining collaboration:', error);
    alert(error.response?.data?.error || 'Failed to join collaboration');
  }
};

  const addCollaborator = async (e) => {
    e.preventDefault();
    if (!event) return;

    try {
      await axios.post(`/api/events/${event._id}/collaborators`, newCollaborator);
      setNewCollaborator({ firstName: '', lastName: '', email: '', permission: 'edit' });
      setShowAddCollaborator(false);
      loadEvent(); // Reload to get updated collaborator list
    } catch (error) {
      console.error('Error adding collaborator:', error);
      alert(error.response?.data?.error || 'Failed to add collaborator');
    }
  };

  const removeCollaborator = async (collaboratorId) => {
    if (!event || !window.confirm('Are you sure you want to remove this collaborator?')) return;

    try {
      await axios.delete(`/api/events/${event._id}/collaborators/${collaboratorId}`);
      loadEvent(); // Reload to get updated collaborator list
    } catch (error) {
      console.error('Error removing collaborator:', error);
      alert(error.response?.data?.error || 'Failed to remove collaborator');
    }
  };

    // Share: invite by email, then ensure collab is enabled and expose the link
 // --- inviteAndGetLink (Share modal submit) ---
const inviteAndGetLink = async (e) => {
  e.preventDefault();
  if (!event) return;
  const norm = (x) => (x || '').trim().toLowerCase();

  try {
    // 1) Invite collaborator by email (stored lowercase on server)
    await axios.post(`/api/events/${event._id}/collaborators`, {
      ...invite,
      email: norm(invite.email),
    });

    // 2) Ensure collaboration is enabled and get link
    if (!event.collaborationEnabled || !event.collaborationId) {
      const resp = await axios.post(`/api/events/${event._id}/collaboration/enable`);
      const { collaborationUrl } = resp.data;
      setShareLink(collaborationUrl);
      await loadEvent();
    } else {
      const base = window?.location?.origin || 'http://localhost:3000';
      setShareLink(`${base.replace(/\/$/, '')}/collaborate/${event.collaborationId}`);
    }

    alert('Invite sent. Only the invited email can join.');
  } catch (err) {
    console.error('Share/invite error', err);
    alert(err.response?.data?.error || 'Failed to invite collaborator');
  }
};



// --- toggleChecklistItem ---
const toggleChecklistItem = async (index) => {
  if (!event) return;

  const norm = (x) => (x || '').trim().toLowerCase();

  // Build a stable identity to send with the PUT
  const emailToSend =
    (user?.email && norm(user.email)) ||
    (identity.email && norm(identity.email)) ||
    (joinForm.email && norm(joinForm.email)) ||
    '';

  const userIdToSend = user?._id || identity.userId || null;
  const userNameToSend =
    (user && `${user.firstName} ${user.lastName}`.trim()) ||
    identity.userName ||
    (joinForm.firstName && joinForm.lastName
      ? `${joinForm.firstName} ${joinForm.lastName}`.trim()
      : 'Anonymous User');

  if (!userIdToSend && !emailToSend) {
    alert('You must join with your email before editing.');
    return;
  }

  const updatedChecklist = [...(event.checklist || [])];
  if (!updatedChecklist[index]) return;
  updatedChecklist[index] = { ...updatedChecklist[index], completed: !updatedChecklist[index].completed };

  try {
    await axios.put(`/api/collaborate/${collaborationId}`, {
      checklist: updatedChecklist,
      userId: userIdToSend,
      email: emailToSend,
      userName: userNameToSend,
    });

    setEvent((prev) => ({ ...prev, checklist: updatedChecklist }));
  } catch (error) {
    console.error('Error updating checklist:', error);
    alert(error.response?.data?.error || 'Failed to update checklist item');
    // Revert by reloading from server
    loadEvent();
  }
};


  const copyCollaborationLink = () => {
    const currentUrl = window.location.href;
    navigator.clipboard.writeText(currentUrl).then(() => {
      alert('Collaboration link copied to clipboard!');
    });
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

  const toggleTaskDetails = (taskId) => {
    const newExpanded = new Set(expandedTasks);
    if (newExpanded.has(taskId)) {
      newExpanded.delete(taskId);
    } else {
      newExpanded.add(taskId);
    }
    setExpandedTasks(newExpanded);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-vanderbilt-gold"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white border border-gray-200 p-8 rounded-lg shadow-sm text-center max-w-md">
          <ExclamationTriangleIcon className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Unable to Load Event</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => navigate('/events')}
            className="px-4 py-2 bg-vanderbilt-gold text-white rounded-md hover:bg-yellow-600"
          >
            Return to Events
          </button>
        </div>
      </div>
    );
  }

  // Show join form if user hasn't joined yet
  if (!hasJoined) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-2xl mx-auto py-12 px-4">
          <div className="bg-white rounded-lg shadow-sm p-8">
            <div className="text-center mb-6">
              <UsersIcon className="h-12 w-12 text-vanderbilt-gold mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Join Collaborative Event</h1>
              <p className="text-gray-600">You've been invited to collaborate on this event:</p>
            </div>
            
            {event && (
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <h2 className="font-semibold text-gray-900">{event.title}</h2>
                <p className="text-sm text-gray-600 mt-1">{formatDate(event.eventDate)}</p>
                {event.description && (
                  <p className="text-gray-700 mt-2">{event.description}</p>
                )}
              </div>
            )}
            
            <form onSubmit={joinCollaboration}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">First Name</label>
                  <input
                    type="text"
                    required
                    value={joinForm.firstName}
                    onChange={(e) => setJoinForm(prev => ({ ...prev, firstName: e.target.value }))}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-vanderbilt-gold focus:border-vanderbilt-gold"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Last Name</label>
                  <input
                    type="text"
                    required
                    value={joinForm.lastName}
                    onChange={(e) => setJoinForm(prev => ({ ...prev, lastName: e.target.value }))}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-vanderbilt-gold focus:border-vanderbilt-gold"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <input
                    type="email"
                    required
                    value={joinForm.email}
                    onChange={(e) => setJoinForm(prev => ({ ...prev, email: e.target.value }))}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-vanderbilt-gold focus:border-vanderbilt-gold"
                  />
                </div>
              </div>
              
              <div className="mt-6">
                <button
                  type="submit"
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-vanderbilt-gold hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-vanderbilt-gold"
                >
                  Join Collaboration
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">Event not found</h2>
        </div>
      </div>
    );
  }

  const isOwner = user && String(event.owner || event.userId) === String(user._id);
  const currentCollaborator = event.collaborators?.find(c => 
    user && (String(c.userId) === String(user._id) || c.email === user.email)
  );
  const canManageCollaborators = isOwner || (currentCollaborator && currentCollaborator.permission === 'admin');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center space-x-3">
                <UsersIcon className="h-6 w-6 text-vanderbilt-gold" />
                <h1 className="text-2xl font-bold text-gray-900">Collaborative Event</h1>
              </div>
              <p className="text-gray-600 mt-1">Working together on: {event.title}</p>
            </div>
            
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowShare(true)}
                className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                <ShareIcon className="h-4 w-4 mr-2" />
                Add Collaborator
              </button>
              
              <button
                onClick={() => {
                  setShowActivity(!showActivity);
                  if (!showActivity) loadActivityLog();
                }}
                className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                <ClockIcon className="h-4 w-4 mr-2" />
                Activity
              </button>
              
              <button
                onClick={() => setShowCollaborators(!showCollaborators)}
                className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                <UsersIcon className="h-4 w-4 mr-2" />
                Collaborators ({(event.collaborators?.length || 0) + 1})
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto py-6 px-4">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-3 space-y-6">
            {/* Event Details */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">{event.title}</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="flex items-center space-x-2">
                  <CalendarIcon className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-600">Date:</span>
                  <span className="text-gray-900">{formatDate(event.eventDate)}</span>
                </div>
                
                {event.expectedAttendance && (
                  <div className="flex items-center space-x-2">
                    <UsersIcon className="h-4 w-4 text-gray-400" />
                    <span className="text-gray-600">Expected Attendance:</span>
                    <span className="text-gray-900">{event.expectedAttendance} people</span>
                  </div>
                )}
                
                <div className="flex items-center space-x-2">
                  <span className="text-gray-600">Priority:</span>
                  <span className={`px-2 py-1 text-xs rounded-full ${getPriorityColor(event.priority)}`}>
                    {event.priority}
                  </span>
                </div>
                
                <div className="flex items-center space-x-2">
                  <span className="text-gray-600">Category:</span>
                  <span className="text-gray-900 capitalize">{event.category}</span>
                </div>
              </div>
              
              {event.description && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <p className="text-gray-700 whitespace-pre-line">{event.description}</p>
                </div>
              )}
            </div>

            {/* Checklist */}
            {event.checklist && event.checklist.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Planning Checklist ({event.checklist.filter(item => !item.isTimeHeader && item.completed).length}/{event.checklist.filter(item => !item.isTimeHeader).length})
                </h2>
                
                <div className="space-y-2">
                  {event.checklist.map((item, index) => (
                    <div key={index}>
                      {item.isTimeHeader ? (
                        <div className="bg-vanderbilt-gold bg-opacity-10 border-l-4 border-vanderbilt-gold px-4 py-2 mt-6 first:mt-0">
                          <h3 className="font-semibold text-gray-900 text-sm">
                            {item.task.replace(/^---\s*/, '').replace(/\s*---$/, '')}
                          </h3>
                        </div>
                      ) : (
                        <div className="ml-4 border-l-2 border-gray-100">
                          <div className="flex items-start space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                            <button
                              onClick={() => toggleChecklistItem(index)}
                              className="h-5 w-5 mt-0.5 flex-shrink-0 cursor-pointer"
                              disabled={!hasJoined}
                            >
                              {item.completed ? (
                                <CheckCircleIconSolid className="h-full w-full text-green-600 hover:text-green-700 transition-colors" />
                              ) : (
                                <CheckCircleIcon className="h-full w-full text-gray-300 hover:text-gray-500 transition-colors" />
                              )}
                            </button>
                            
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <p className={`transition-all ${item.completed ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                                  {item.task}
                                </p>
                                
                                <button
                                  onClick={() => toggleTaskDetails(item._id || `${index}-${item.task}`)}
                                  className="ml-2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
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
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Collaborators Panel */}
            {showCollaborators && (
              <div className="bg-white rounded-lg shadow-sm p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900">Collaborators</h3>
                  {canManageCollaborators && (
                    <button
                      onClick={() => setShowAddCollaborator(!showAddCollaborator)}
                      className="text-vanderbilt-gold hover:text-yellow-600"
                    >
                      <PlusIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>
                
                {/* Add Collaborator Form */}
                {showAddCollaborator && (
                  <form onSubmit={addCollaborator} className="mb-4 p-3 bg-gray-50 rounded">
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="First Name"
                        required
                        value={newCollaborator.firstName}
                        onChange={(e) => setNewCollaborator(prev => ({ ...prev, firstName: e.target.value }))}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                      <input
                        type="text"
                        placeholder="Last Name"
                        required
                        value={newCollaborator.lastName}
                        onChange={(e) => setNewCollaborator(prev => ({ ...prev, lastName: e.target.value }))}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                      <input
                        type="email"
                        placeholder="Email"
                        required
                        value={newCollaborator.email}
                        onChange={(e) => setNewCollaborator(prev => ({ ...prev, email: e.target.value }))}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                      <select
                        value={newCollaborator.permission}
                        onChange={(e) => setNewCollaborator(prev => ({ ...prev, permission: e.target.value }))}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      >
                        <option value="edit">Can Edit</option>
                        <option value="view">View Only</option>
                        <option value="admin">Admin</option>
                      </select>
                      <div className="flex space-x-2">
                        <button
                          type="submit"
                          className="px-3 py-1 text-sm bg-vanderbilt-gold text-white rounded hover:bg-yellow-600"
                        >
                          Add
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowAddCollaborator(false)}
                          className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </form>
                )}
                
                {/* Owner */}
              <div className="space-y-2">
                <div className="flex items-center justify-between p-2 bg-yellow-50 rounded">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {event.ownerInfo
                        ? `${event.ownerInfo.firstName} ${event.ownerInfo.lastName}`.trim()
                        : 'Owner'}
                    </p>
                    <p className="text-xs text-gray-600">
                      {event.ownerInfo?.email || 'Event creator'}
                    </p>
                  </div>
                  <span className="text-xs bg-yellow-200 text-yellow-800 px-2 py-1 rounded">Owner</span>
                </div>
                  
                  {/* Collaborators */}
                  {event.collaborators?.map((collaborator) => (
                    <div key={collaborator._id} className="flex items-center justify-between p-2 border border-gray-200 rounded">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {collaborator.firstName} {collaborator.lastName}
                        </p>
                        <p className="text-xs text-gray-600">{collaborator.email}</p>
                        <p className="text-xs text-gray-500">
                          Last active: {collaborator.lastActive ? new Date(collaborator.lastActive).toLocaleDateString() : 'Never'}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                          {collaborator.permission}
                        </span>
                        {canManageCollaborators && (
                          <button
                            onClick={() => removeCollaborator(collaborator._id)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <XMarkIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Activity Panel */}
            {showActivity && (
              <div className="bg-white rounded-lg shadow-sm p-4">
                <h3 className="font-semibold text-gray-900 mb-4">Recent Activity</h3>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {activityLog.length > 0 ? (
                    activityLog.map((activity, index) => (
                      <div key={index} className="text-sm">
                        <div className="flex items-start space-x-2">
                          <div className="flex-shrink-0 mt-1">
                            {activity.action === 'completed_task' ? (
                              <CheckCircleIconSolid className="h-4 w-4 text-green-500" />
                            ) : activity.action === 'uncompleted_task' ? (
                              <CheckCircleIcon className="h-4 w-4 text-gray-400" />
                            ) : activity.action === 'joined' ? (
                              <UsersIcon className="h-4 w-4 text-blue-500" />
                            ) : (
                              <InformationCircleIcon className="h-4 w-4 text-gray-400" />
                            )}
                          </div>
                          <div className="flex-1">
                            <p className="text-gray-900">
                              <span className="font-medium">{activity.userName}</span>
                              {' '}{activity.description}
                            </p>
                            <p className="text-gray-500 text-xs">
                              {new Date(activity.timestamp).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500 text-sm">No activity yet</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    {showShare && (
  <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
    <div className="relative bg-white rounded-lg p-6 w-full max-w-md shadow-lg">
      {/* X close button (top-right) */}
      <button
        type="button"
        aria-label="Close"
        onClick={() => setShowShare(false)}
        className="absolute top-3 right-3 p-1 rounded hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-vanderbilt-gold"
      >
        <XMarkIcon className="h-5 w-5 text-gray-600" />
      </button>

      <h3 className="text-lg font-semibold mb-4 pr-8">Share & Invite</h3>

      <form onSubmit={inviteAndGetLink} className="space-y-3">
        <input
          className="w-full border rounded px-3 py-2"
          placeholder="First name"
          required
          value={invite.firstName}
          onChange={e => setInvite(s => ({ ...s, firstName: e.target.value }))}
        />
        <input
          className="w-full border rounded px-3 py-2"
          placeholder="Last name"
          required
          value={invite.lastName}
          onChange={e => setInvite(s => ({ ...s, lastName: e.target.value }))}
        />
        <input
          className="w-full border rounded px-3 py-2"
          placeholder="Email"
          type="email"
          required
          value={invite.email}
          onChange={e => setInvite(s => ({ ...s, email: e.target.value }))}
        />
        <select
          className="w-full border rounded px-3 py-2"
          value={invite.permission}
          onChange={e => setInvite(s => ({ ...s, permission: e.target.value }))}
        >
          <option value="edit">Can Edit</option>
          <option value="view">View Only</option>
          <option value="admin">Admin</option>
        </select>

        <div className="flex items-center justify-end pt-2">
          <button type="submit" className="px-3 py-2 bg-vanderbilt-gold text-white rounded hover:bg-yellow-600">
            Invite
          </button>
        </div>
      </form>

      {shareLink && (
        <div className="mt-4 p-3 bg-gray-50 rounded">
          {/* Hoverable, clickable link */}
          <a
            href={shareLink}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-blue-600 hover:underline break-all"
            title="Open collaboration link"
          >
            {shareLink}
          </a>

          <div className="mt-2">
            <button
              className="px-3 py-1 border rounded hover:bg-gray-100"
              onClick={copyShareLink}
              type="button"
            >
              Copy Link
            </button>
          </div>
        </div>
      )}
    </div>
  </div>
)}

    </div>
  );
};

export default CollaborativeEvent;