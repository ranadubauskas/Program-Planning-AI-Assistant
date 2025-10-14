import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { UserIcon, ChatBubbleLeftRightIcon, HomeIcon, ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline';

const Header = ({ user, onLogout }) => {
  const location = useLocation();

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
    { name: 'AI Assistant', href: '/chat', icon: ChatBubbleLeftRightIcon },
  ];

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <div className="flex-shrink-0">
              <h1 className="text-xl font-bold text-vanderbilt-black">
                Vanderbilt Program Planning Assistant
              </h1>
            </div>
            <nav className="hidden md:flex space-x-8">
              {navigation.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`inline-flex items-center px-1 pt-1 text-sm font-medium border-b-2 ${
                      location.pathname.startsWith(item.href)
                        ? 'border-vanderbilt-gold text-vanderbilt-black'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="h-4 w-4 mr-2" />
                    {item.name}
                  </Link>
                );
              })}
            </nav>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-sm">
              <UserIcon className="h-5 w-5 text-gray-400" />
              <span className="text-gray-700">{user.firstName} {user.lastName}</span>
              <span className="px-2 py-1 text-xs bg-vanderbilt-gold text-white rounded-full">
                {user.role}
              </span>
            </div>
            <button
              onClick={onLogout}
              className="inline-flex items-center px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
            >
              <ArrowRightOnRectangleIcon className="h-4 w-4 mr-1" />
              Logout
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;