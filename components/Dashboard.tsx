import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, Users, Brain, Activity, MessageCircle, CreditCard, 
  Settings, LogOut, Menu, X, Bell
} from 'lucide-react';
import ClientList from './ClientList';
// FIX: Changed to a named import for MealPlanner as it does not have a default export.
import { MealPlanner } from './MealPlanner';
import ProgressTracker from './ProgressTracker';
import ClientProfile from './ClientProfile';
import Billing from './Billing';
import AccountSettings from './AccountSettings'; // New: Import AccountSettings
import { Client, Notification } from '../types';
import { supabase } from '../services/supabase';

interface ToastNotificationProps {
  notification: Notification;
  onClose: () => void;
  onClick: () => void;
}

const ToastNotification: React.FC<ToastNotificationProps> = ({ notification, onClose, onClick }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000); // Auto-dismiss after 5 seconds
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div 
      onClick={onClick}
      className="p-4 bg-slate-900 text-white rounded-lg shadow-2xl flex gap-3 items-start animate-in slide-in-from-bottom-5 fade-in duration-300 cursor-pointer hover:bg-slate-800"
    >
      <div className="w-8 h-8 rounded-full bg-[#8FAA41] flex-shrink-0 flex items-center justify-center mt-1">
         <MessageCircle className="w-4 h-4" />
      </div>
      <div>
        <h4 className="font-bold text-sm">New message from {notification.clientName}</h4>
        <p className="text-sm text-slate-300 line-clamp-2">{notification.content}</p>
      </div>
      <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="p-1 -mr-2 -mt-2 text-slate-400 hover:text-white">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

// FIX: Added DashboardProps interface to define component props.
interface DashboardProps {
  onLogout: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onLogout }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [viewState, setViewState] = useState<'list' | 'profile'>('list');
  
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activeToasts, setActiveToasts] = useState<Notification[]>([]);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [showNotificationPopover, setShowNotificationPopover] = useState(false);

  const [stats, setStats] = useState({
    totalClients: 0,
    activeClients: 0,
    plansGenerated: 0
  });

  const [initialProfileTab, setInitialProfileTab] = useState<'overview' | 'messages' | 'meal_plans' | 'food' | 'schedule' | 'billing' | 'records'>('overview');
  const audioContextRef = useRef<AudioContext | null>(null);

  const playNotificationSound = () => {
    if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const audioContext = audioContextRef.current;
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.5);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  };

  const fetchClients = async () => {
    setClientsLoading(true);
    try {
        const { data, error } = await supabase.from('clients').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        if (data) {
          const formattedClients: Client[] = data.map((c: any) => ({
            id: c.id, name: c.name, email: c.email, status: c.status || 'Active', goal: c.goal || 'General Health', lastCheckIn: c.last_check_in ? new Date(c.last_check_in).toLocaleDateString() : 'Never', avatarUrl: c.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.name)}&background=93C47D&color=fff`, age: c.age, weight: c.weight, height: c.height, activityLevel: c.activity_level, allergies: c.allergies, preferences: c.preferences, joinedAt: c.created_at, medicalHistory: c.medical_history, medications: c.medications, habits: c.habits ? JSON.parse(c.habits) : undefined, bodyFatPercentage: c.body_fat_percentage, bodyFatMass: c.body_fat_mass, skeletalMuscleMass: c.skeletal_muscle_mass, skeletalMusclePercentage: c.skeletal_muscle_percentage, portalAccessToken: c.portal_access_token, dietaryHistory: c.dietary_history
          }));
          setClients(formattedClients);
        }
    } catch (err) { console.error('Error fetching clients:', err); } 
    finally { setClientsLoading(false); }
  };
  
  const handleUpdateClient = (updatedClient: Client) => {
    setClients(prevClients => prevClients.map(c => c.id === updatedClient.id ? updatedClient : c));
    if (selectedClient && selectedClient.id === updatedClient.id) {
      setSelectedClient(updatedClient);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      const { count: total } = await supabase.from('clients').select('*', { count: 'exact', head: true });
      const { count: active } = await supabase.from('clients').select('*', { count: 'exact', head: true }).eq('status', 'Active');
      const { count: plans } = await supabase.from('meal_plans').select('*', { count: 'exact', head: true });
      
      setStats({
        totalClients: total || 0,
        activeClients: active || 0,
        plansGenerated: plans || 0
      });
    };
    fetchStats();
  }, [activeTab]);

  useEffect(() => {
    if (clients.length === 0) return;

    const channel = supabase.channel('public:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          if (payload.new.sender === 'client') {
            const client = clients.find(c => c.id === payload.new.client_id);
            if (client) {
              const newNotification: Notification = {
                id: payload.new.id,
                clientId: payload.new.client_id,
                clientName: client.name,
                content: payload.new.content,
                createdAt: payload.new.created_at,
                type: 'message',
              };
              setNotifications(prev => [newNotification, ...prev].slice(0, 10));
              setActiveToasts(prev => [...prev, newNotification]);
              setUnreadMessageCount(prev => prev + 1);
              playNotificationSound();
            }
          }
        }
      ).subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [clients]);

  const navItems = [
    { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'clients', label: 'Clients', icon: Users },
    { id: 'planner', label: 'Meal Planner', icon: Brain },
    { id: 'progress', label: 'Progress', icon: Activity },
    { id: 'messages', label: 'Messages', icon: MessageCircle },
    { id: 'billing', label: 'Billing', icon: CreditCard },
  ];

  const handleClientSelect = (client: Client) => {
    setSelectedClient(client);
    setActiveTab('clients');
    setViewState('profile');
    setInitialProfileTab('overview');
  };

  const handleNotificationClick = (notification: Notification) => {
    const client = clients.find(c => c.id === notification.clientId);
    if (client) {
      setSelectedClient(client);
      setActiveTab('clients');
      setViewState('profile');
      setInitialProfileTab('messages');
      setShowNotificationPopover(false);
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'clients':
        if (viewState === 'profile' && selectedClient) {
          return (
            <ClientProfile 
              client={selectedClient} 
              onBack={() => {
                  setViewState('list');
                  setInitialProfileTab('overview');
              }}
              initialTab={initialProfileTab}
              onUpdateClient={handleUpdateClient}
            />
          );
        }
        return (
          <ClientList 
            clients={clients}
            loading={clientsLoading}
            onSelectClient={handleClientSelect} 
            selectedClientId={selectedClient?.id}
            onRefresh={fetchClients}
          />
        );
      case 'billing':
        return <Billing onClientClick={handleClientSelect} />;
      case 'planner':
        return <MealPlanner selectedClient={selectedClient} />;
      case 'progress':
        return <ProgressTracker selectedClient={selectedClient} />;
      case 'settings':
        return <AccountSettings />;
      case 'overview':
      default:
        return (
          <div className="space-y-6 animate-in fade-in duration-500">
             <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
            <div className="grid md:grid-cols-3 gap-6">
               <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                  <h3 className="text-slate-500 text-sm font-medium mb-1">Total Clients</h3>
                  <div className="text-3xl font-bold text-slate-900">{stats.totalClients}</div>
                  <div className="text-[#8FAA41] text-xs mt-1">{stats.activeClients} Active</div>
               </div>
               <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                  <h3 className="text-slate-500 text-sm font-medium mb-1">Plans Generated</h3>
                  <div className="text-3xl font-bold text-slate-900">{stats.plansGenerated}</div>
                  <div className="text-[#8FAA41] text-xs mt-1">AI Saved ~12hrs</div>
               </div>
               <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                  <h3 className="text-slate-500 text-sm font-medium mb-1">Revenue</h3>
                  <div className="text-3xl font-bold text-slate-900">$4,250</div>
                  <div className="text-[#8FAA41] text-xs mt-1">+12% vs last month</div>
               </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
               <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="font-bold text-slate-900">Quick Client Access</h3>
                    <button onClick={() => { setActiveTab('clients'); setViewState('list');}} className="text-[#8C3A36] text-sm font-medium hover:underline">View All</button>
                  </div>
                  <ClientList 
                    clients={clients}
                    loading={clientsLoading}
                    compact 
                    onSelectClient={handleClientSelect}
                    selectedClientId={selectedClient?.id}
                    onRefresh={fetchClients}
                  />
               </div>

               <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                  <h3 className="font-bold text-slate-900 mb-4">Recent Activity</h3>
                  <div className="space-y-4">
                     {notifications.slice(0, 3).map(n => (
                        <div key={n.id} className="flex gap-3 items-start pb-3 border-b border-slate-50 last:border-0">
                           <div className="w-8 h-8 rounded-full bg-[#F9F5F5] flex items-center justify-center flex-shrink-0 mt-1">
                           <MessageCircle className="w-4 h-4 text-[#8C3A36]" />
                           </div>
                           <div>
                           <p className="text-sm text-slate-800">New message from <span className="font-bold">{n.clientName}</span></p>
                           <p className="text-xs text-slate-500 line-clamp-1">{n.content}</p>
                           </div>
                        </div>
                     ))}
                     {notifications.length === 0 && (
                        <div className="text-center text-slate-400 py-4 text-sm">No new activity.</div>
                     )}
                  </div>
               </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans w-full overflow-x-hidden">
      <aside className="hidden md:flex flex-col w-64 bg-slate-900 text-slate-300 h-screen sticky top-0">
        <div className="p-4 flex items-center justify-center">
          <img src="https://nutritherapy.co.ke/wp-content/uploads/2024/08/7e3cca79-563d-4b42-babb-5e96a6ff0b6e.png" alt="NutriTherapy Solutions Logo" className="h-16" />
        </div>
        <nav className="flex-1 px-4 space-y-1 mt-4">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => { 
                if (item.id === 'messages') {
                    setActiveTab('clients');
                    if (selectedClient) {
                       setViewState('profile');
                       setInitialProfileTab('messages');
                    } else {
                       setViewState('list');
                    }
                } else {
                    setActiveTab(item.id); 
                    if(item.id === 'clients') {
                        setViewState('list');
                        setInitialProfileTab('overview');
                    }
                }
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors
                ${(activeTab === item.id || (item.id === 'clients' && activeTab === 'messages')) ? 'bg-[#8C3A36] text-white' : 'hover:bg-slate-800 hover:text-white'}`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </button>
          ))}
        </nav>
        
        {selectedClient && (
          <div className="px-4 mb-4">
             <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
                <p className="text-xs text-slate-400 uppercase font-bold mb-1">Active Client</p>
                <div className="flex items-center gap-2 cursor-pointer hover:opacity-80" onClick={() => {setActiveTab('clients'); setViewState('profile'); setInitialProfileTab('overview');}}>
                   <div className="w-2 h-2 rounded-full bg-[#8FAA41]"></div>
                   <span className="text-white font-medium text-sm truncate">{selectedClient.name}</span>
                </div>
                <button 
                  onClick={() => setSelectedClient(null)}
                  className="text-xs text-slate-400 hover:text-white mt-2 underline"
                >
                  Clear Selection
                </button>
             </div>
          </div>
        )}

        <div className="p-4 border-t border-slate-800 space-y-1">
          <button
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'settings' 
                ? 'bg-slate-700 text-white' 
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Settings className="w-5 h-5" />
            Settings
          </button>
          <button 
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg hover:bg-red-900/20 hover:text-red-400 text-slate-400"
          >
            <LogOut className="w-5 h-5" />
            Logout
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-h-screen md:h-screen w-full overflow-x-hidden">
        <header className="bg-white/80 backdrop-blur-md sticky top-0 z-10 border-b border-slate-200 md:px-8 px-4 py-3 flex justify-between items-center w-full">
          <div className="flex items-center gap-3 flex-1 md:flex-none">
            <button onClick={() => setMobileMenuOpen(true)} className="md:hidden text-slate-700">
              <Menu className="w-6 h-6" />
            </button>
            <div className="md:hidden">
              <img src="https://nutritherapy.co.ke/wp-content/uploads/2024/08/7e3cca79-563d-4b42-babb-5e96a6ff0b6e.png" alt="Logo" className="h-8" />
            </div>
            {selectedClient && (
              <div className="flex items-center gap-2 bg-[#F9F5F5] text-[#8C3A36] px-2 md:px-3 py-1 rounded-full text-xs md:text-sm border border-stone-200 truncate max-w-[200px] md:max-w-none">
                <span className="w-2 h-2 rounded-full bg-[#8FAA41] flex-shrink-0"></span>
                <span className="hidden sm:inline">Working with: </span><strong className="truncate">{selectedClient.name}</strong>
              </div>
            )}
          </div>
          <div className="relative">
            <button 
              onClick={() => {
                setShowNotificationPopover(!showNotificationPopover);
                setUnreadMessageCount(0);
              }}
              className="p-2 rounded-full hover:bg-slate-100 relative"
            >
              <Bell className="text-slate-600" />
              {unreadMessageCount > 0 && (
                <span className="absolute top-1 right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 justify-center items-center text-white text-[9px]">{unreadMessageCount}</span>
                </span>
              )}
            </button>
            {showNotificationPopover && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-2xl border border-slate-200 z-20 animate-in fade-in duration-150">
                <div className="p-3 font-bold border-b flex justify-between items-center">
                  <span>Notifications</span>
                  <button onClick={() => setNotifications([])} className="text-xs font-medium text-[#8C3A36] hover:underline">Clear all</button>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.length > 0 ? notifications.map(n => (
                    <div key={n.id} onClick={() => handleNotificationClick(n)} className="p-3 border-b hover:bg-slate-50 cursor-pointer">
                       <p className="text-sm font-bold text-slate-800">New message from {n.clientName}</p>
                       <p className="text-sm text-slate-600 line-clamp-2">{n.content}</p>
                       <p className="text-xs text-slate-400 mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                    </div>
                  )) : <p className="p-4 text-sm text-slate-500">No new notifications.</p>}
                </div>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 p-3 sm:p-4 md:p-8 overflow-y-auto overflow-x-hidden w-full">
          {renderContent()}
        </main>
      </div>

      {mobileMenuOpen && (
        <div className="fixed inset-0 bg-slate-900 z-30 md:hidden animate-in slide-in-from-left duration-200 flex flex-col">
          <div className="p-4 flex justify-between items-center border-b border-slate-800">
            <div className="flex items-center gap-2 text-white font-bold">
              <img src="https://nutritherapy.co.ke/wp-content/uploads/2024/08/7e3cca79-563d-4b42-babb-5e96a6ff0b6e.png" alt="NutriTherapy Solutions Logo" className="h-8" />
            </div>
            <button onClick={() => setMobileMenuOpen(false)} className="text-white"><X /></button>
          </div>
          <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => { 
                    if (item.id === 'messages') {
                        setActiveTab('clients');
                        if (selectedClient) setViewState('profile');
                        else setViewState('list');
                        setInitialProfileTab('messages');
                    } else {
                        setActiveTab(item.id); 
                        if(item.id === 'clients') setViewState('list');
                    }
                    setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-lg font-medium rounded-lg transition-colors
                  ${activeTab === item.id ? 'bg-[#8C3A36] text-white' : 'text-slate-300'}`}
              >
                <item.icon className="w-6 h-6" />
                {item.label}
              </button>
            ))}
            <button
              onClick={() => {
                setActiveTab('settings');
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 text-lg font-medium rounded-lg transition-colors mt-2
                ${activeTab === 'settings' ? 'bg-slate-700 text-white' : 'text-slate-300'}`}
            >
              <Settings className="w-6 h-6" />
              Settings
            </button>
             <button 
                onClick={onLogout}
                className="w-full flex items-center gap-3 px-4 py-3 text-lg font-medium rounded-lg text-red-400 mt-8"
              >
                <LogOut className="w-6 h-6" />
                Logout
              </button>
          </nav>
        </div>
      )}

      <div className="fixed bottom-5 right-5 z-50 space-y-3">
        {activeToasts.map(notif => (
          <ToastNotification 
            key={notif.id} 
            notification={notif}
            onClick={() => handleNotificationClick(notif)}
            onClose={() => setActiveToasts(prev => prev.filter(n => n.id !== notif.id))}
          />
        ))}
      </div>
    </div>
  );
};

export default Dashboard;