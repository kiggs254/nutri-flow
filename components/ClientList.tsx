
import React, { useEffect, useState } from 'react';
import { Search, Plus, Loader2, RefreshCw, Database, Trash2, Check, Users, Mail, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Client } from '../types';
import { supabase } from '../services/supabase';
import { SETUP_SQL } from '../utils/dbSchema';
import { useToast } from '../utils/toast';
import { ConfirmModal } from '../utils/confirmModal';

interface ClientListProps {
  clients: Client[];
  loading: boolean;
  onRefresh: () => void;
  compact?: boolean;
  onSelectClient?: (client: Client) => void;
  selectedClientId?: string;
}

const ClientList: React.FC<ClientListProps> = ({ clients, loading, onRefresh, compact = false, onSelectClient, selectedClientId }) => {
  const { showToast } = useToast();
  const [isTableMissing, setIsTableMissing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<string | null>(null);
  
  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAdvancedFields, setShowAdvancedFields] = useState(false);
  const [bodyFatFormat, setBodyFatFormat] = useState<'percentage' | 'kg'>('percentage');
  const [muscleMassFormat, setMuscleMassFormat] = useState<'kg' | 'percentage'>('kg');
  const [newClient, setNewClient] = useState({
    name: '',
    email: '',
    age: 30,
    weight: 70,
    height: 170,
    goal: 'Weight Loss',
    customGoal: '',
    bodyFatPercentage: '',
    bodyFatMass: '',
    skeletalMuscleMass: '',
    skeletalMusclePercentage: '',
    medicalHistory: '',
    allergies: '',
    medications: '',
    dietaryHistory: '',
    socialBackground: '',
  });
  const [submitting, setSubmitting] = useState(false);

  // This effect checks for the table missing error, but doesn't fetch.
  useEffect(() => {
    const checkTable = async () => {
      try {
        const { data, error } = await supabase.from('clients').select('id').limit(1);
        if (error) {
           if (error.code === '42P01' || (error.message && error.message.includes('does not exist'))) {
             setIsTableMissing(true);
           }
        }
      } catch (e) {}
    };
    checkTable();
  }, []);


  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const finalGoal = newClient.goal === 'Custom...' ? newClient.customGoal : newClient.goal;

      const { error } = await supabase.from('clients').insert({
        user_id: user.id,
        name: newClient.name,
        email: newClient.email,
        age: newClient.age,
        weight: newClient.weight,
        height: newClient.height,
        goal: finalGoal,
        status: 'Active',
        body_fat_percentage: newClient.bodyFatPercentage ? parseFloat(newClient.bodyFatPercentage) : null,
        body_fat_mass: newClient.bodyFatMass ? parseFloat(newClient.bodyFatMass) : null,
        skeletal_muscle_mass: newClient.skeletalMuscleMass ? parseFloat(newClient.skeletalMuscleMass) : null,
        skeletal_muscle_percentage: newClient.skeletalMusclePercentage ? parseFloat(newClient.skeletalMusclePercentage) : null,
        medical_history: newClient.medicalHistory || null,
        allergies: newClient.allergies || null,
        medications: newClient.medications || null,
        dietary_history: newClient.dietaryHistory || null,
        social_background: newClient.socialBackground || null,
      });

      if (error) throw error;
      
      setShowAddModal(false);
      setShowAdvancedFields(false);
      setBodyFatFormat('percentage');
      setMuscleMassFormat('kg');
      setNewClient({ name: '', email: '', age: 30, weight: 70, height: 170, goal: 'Weight Loss', customGoal: '', bodyFatPercentage: '', bodyFatMass: '', skeletalMuscleMass: '', skeletalMusclePercentage: '', medicalHistory: '', allergies: '', medications: '', dietaryHistory: '', socialBackground: '' });
      onRefresh(); // Refresh clients list in parent
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteClient = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setClientToDelete(id);
    setShowDeleteConfirm(true);
  };

  const confirmDeleteClient = async () => {
    if (!clientToDelete) return;
    try {
      const { error } = await supabase.from('clients').delete().eq('id', clientToDelete);
      if (error) throw error;
      showToast('Client deleted successfully', 'success');
      onRefresh(); // Refresh clients list in parent
    } catch (err: any) {
      showToast('Error deleting client', 'error');
    }
    setShowDeleteConfirm(false);
    setClientToDelete(null);
  };


  if (isTableMissing) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-8 border border-red-100 max-w-4xl mx-auto">
        <div className="flex items-center gap-3 text-red-600 mb-4">
          <Database className="w-8 h-8" />
          <h2 className="text-xl font-bold">Database Update Required</h2>
        </div>
        <p className="text-slate-600 mb-6">
          Your database schema is outdated. Please run the SQL below in Supabase to enable the new CRM features (Billing, Appointments, Food Logs).
        </p>
        <div className="bg-slate-900 text-slate-300 p-4 rounded-lg overflow-x-auto text-xs font-mono mb-6 relative group">
          <button 
            onClick={() => navigator.clipboard.writeText(SETUP_SQL)}
            className="absolute top-2 right-2 bg-slate-700 hover:bg-slate-600 text-white px-3 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity"
          >
            Copy SQL
          </button>
          <pre>{SETUP_SQL}</pre>
        </div>
        <button onClick={() => { setIsTableMissing(false); onRefresh(); }} className="bg-[#8C3A36] text-white px-6 py-2 rounded-lg font-bold hover:bg-[#7a2f2b] flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> I've Run the SQL, Refresh App
        </button>
      </div>
    );
  }

  return (
    <div>
      {!compact && (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 md:mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Clients</h2>
          <button 
            onClick={() => setShowAddModal(true)}
            className="w-full sm:w-auto bg-[#8C3A36] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#7a2f2b] flex items-center justify-center gap-2 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" /> Add Client
          </button>
        </div>
      )}

      <div className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden ${compact ? '' : 'min-h-[400px]'}`}>
        {!compact && (
          <div className="p-3 sm:p-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-center">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search clients..." 
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-[#8C3A36] focus:border-[#8C3A36] outline-none transition-all"
              />
            </div>
            <button onClick={onRefresh} className="p-2 text-slate-500 hover:text-[#8C3A36] transition-colors self-start sm:self-auto">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        )}

        {loading && clients.length === 0 ? (
          <div className="p-8 sm:p-12 text-center text-slate-500">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-[#8C3A36]" />
            <p>Loading clients...</p>
          </div>
        ) : clients.length === 0 ? (
          <div className="p-8 sm:p-12 text-center text-slate-500">
            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Users className="w-6 h-6 text-slate-400" />
            </div>
            <p>No clients found. Add your first client.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* Mobile Card View */}
            <div className="block md:hidden divide-y divide-slate-100">
              {clients.map(client => (
                <div
                  key={client.id}
                  onClick={() => onSelectClient?.(client)}
                  className={`p-4 transition-colors cursor-pointer ${
                    selectedClientId === client.id ? 'bg-[#F9F5F5]' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="relative flex-shrink-0">
                        <img src={client.avatarUrl} alt={client.name} className="w-12 h-12 rounded-full object-cover bg-slate-200 border border-slate-200" />
                        {selectedClientId === client.id && (
                          <div className="absolute -right-1 -bottom-1 bg-[#8FAA41] text-white rounded-full p-0.5 border-2 border-white">
                            <Check className="w-2 h-2" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`font-medium text-base truncate ${selectedClientId === client.id ? 'text-[#8C3A36]' : 'text-slate-900'}`}>
                          {client.name}
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                          <Mail className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{client.email}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                            ${client.status === 'Active' ? 'bg-green-100 text-green-800' : 
                              client.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' : 
                              'bg-slate-100 text-slate-800'}`}>
                            {client.status}
                          </span>
                          <span className="text-xs text-slate-600 truncate">{client.goal}</span>
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={(e) => handleDeleteClient(e, client.id)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                      title="Delete Client"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Desktop Table View */}
            <table className="w-full text-left hidden md:table">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-medium">
                <tr>
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Goal</th>
                  <th className="px-6 py-4">Last Check-in</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {clients.map(client => (
                  <tr 
                    key={client.id} 
                    onClick={() => onSelectClient?.(client)}
                    className={`
                      group transition-colors cursor-pointer
                      ${selectedClientId === client.id ? 'bg-[#F9F5F5]' : 'hover:bg-slate-50'}
                    `}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <img src={client.avatarUrl} alt={client.name} className="w-10 h-10 rounded-full object-cover bg-slate-200 border border-slate-200" />
                          {selectedClientId === client.id && (
                            <div className="absolute -right-1 -bottom-1 bg-[#8FAA41] text-white rounded-full p-0.5 border-2 border-white">
                              <Check className="w-2 h-2" />
                            </div>
                          )}
                        </div>
                        <div>
                          <div className={`font-medium ${selectedClientId === client.id ? 'text-[#8C3A36]' : 'text-slate-900'}`}>
                            {client.name}
                          </div>
                          <div className="text-xs text-slate-500 flex items-center gap-1">
                            <Mail className="w-3 h-3" /> {client.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                        ${client.status === 'Active' ? 'bg-green-100 text-green-800' : 
                          client.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' : 
                          'bg-slate-100 text-slate-800'}`}>
                        {client.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{client.goal}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                       {client.lastCheckIn}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={(e) => handleDeleteClient(e, client.id)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        title="Delete Client"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
             <div className="bg-[#8C3A36] p-6 flex justify-between items-center text-white">
                <h3 className="text-xl font-bold">Add New Client</h3>
                <button onClick={() => setShowAddModal(false)} className="hover:bg-[#7a2f2b] p-1 rounded transition-colors">
                   <X className="w-5 h-5" />
                </button>
             </div>
             <form onSubmit={handleAddClient} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 uppercase">Name</label>
                    <input required type="text" className="w-full p-2 border border-slate-300 rounded-lg" value={newClient.name} onChange={e => setNewClient({...newClient, name: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 uppercase">Email</label>
                    <input required type="email" className="w-full p-2 border border-slate-300 rounded-lg" value={newClient.email} onChange={e => setNewClient({...newClient, email: e.target.value})} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                   <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700 uppercase">Age</label>
                      <input type="number" className="w-full p-2 border border-slate-300 rounded-lg" value={newClient.age} onChange={e => setNewClient({...newClient, age: parseInt(e.target.value)})} />
                   </div>
                   <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700 uppercase">Height (cm)</label>
                      <input type="number" className="w-full p-2 border border-slate-300 rounded-lg" value={newClient.height} onChange={e => setNewClient({...newClient, height: parseInt(e.target.value)})} />
                   </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700 uppercase">Weight (kg)</label>
                      <input type="number" step="0.1" className="w-full p-2 border border-slate-300 rounded-lg" value={newClient.weight} onChange={e => setNewClient({...newClient, weight: parseFloat(e.target.value)})} />
                   </div>
                </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-bold text-slate-700 uppercase">Body Fat</label>
                            <div className="flex gap-1 bg-slate-100 rounded p-0.5">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setBodyFatFormat('percentage');
                                        setNewClient({...newClient, bodyFatMass: ''});
                                    }}
                                    className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${bodyFatFormat === 'percentage' ? 'bg-white text-[#8C3A36] shadow-sm' : 'text-slate-600'}`}
                                >
                                    %
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setBodyFatFormat('kg');
                                        setNewClient({...newClient, bodyFatPercentage: ''});
                                    }}
                                    className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${bodyFatFormat === 'kg' ? 'bg-white text-[#8C3A36] shadow-sm' : 'text-slate-600'}`}
                                >
                                    kg
                                </button>
                            </div>
                        </div>
                        {bodyFatFormat === 'percentage' ? (
                            <input 
                                type="number" 
                                step="0.1" 
                                placeholder="%" 
                                className="w-full p-2 border border-slate-300 rounded-lg" 
                                value={newClient.bodyFatPercentage} 
                                onChange={e => setNewClient({...newClient, bodyFatPercentage: e.target.value, bodyFatMass: ''})} 
                            />
                        ) : (
                            <input 
                                type="number" 
                                step="0.1" 
                                placeholder="kg" 
                                className="w-full p-2 border border-slate-300 rounded-lg" 
                                value={newClient.bodyFatMass} 
                                onChange={e => setNewClient({...newClient, bodyFatMass: e.target.value, bodyFatPercentage: ''})} 
                            />
                        )}
                    </div>
                     <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-bold text-slate-700 uppercase">Muscle Mass</label>
                            <div className="flex gap-1 bg-slate-100 rounded p-0.5">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMuscleMassFormat('kg');
                                        setNewClient({...newClient, skeletalMusclePercentage: ''});
                                    }}
                                    className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${muscleMassFormat === 'kg' ? 'bg-white text-[#8C3A36] shadow-sm' : 'text-slate-600'}`}
                                >
                                    kg
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMuscleMassFormat('percentage');
                                        setNewClient({...newClient, skeletalMuscleMass: ''});
                                    }}
                                    className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${muscleMassFormat === 'percentage' ? 'bg-white text-[#8C3A36] shadow-sm' : 'text-slate-600'}`}
                                >
                                    %
                                </button>
                            </div>
                        </div>
                        {muscleMassFormat === 'kg' ? (
                            <input 
                                type="number" 
                                step="0.1" 
                                placeholder="kg" 
                                className="w-full p-2 border border-slate-300 rounded-lg" 
                                value={newClient.skeletalMuscleMass} 
                                onChange={e => setNewClient({...newClient, skeletalMuscleMass: e.target.value, skeletalMusclePercentage: ''})} 
                            />
                        ) : (
                            <input 
                                type="number" 
                                step="0.1" 
                                placeholder="%" 
                                className="w-full p-2 border border-slate-300 rounded-lg" 
                                value={newClient.skeletalMusclePercentage} 
                                onChange={e => setNewClient({...newClient, skeletalMusclePercentage: e.target.value, skeletalMuscleMass: ''})} 
                            />
                        )}
                    </div>
                </div>
                <div className="space-y-1">
                   <label className="text-xs font-bold text-slate-700 uppercase">Goal</label>
                   <select className="w-full p-2 border border-slate-300 rounded-lg" value={newClient.goal} onChange={e => setNewClient({...newClient, goal: e.target.value})}>
                     <option>Weight Loss</option>
                     <option>Muscle Gain</option>
                     <option>Maintenance</option>
                     <option>General Health</option>
                     <option value="Custom...">Custom...</option>
                   </select>
                </div>
                {newClient.goal === 'Custom...' && (
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 uppercase">Custom Goal</label>
                    <input 
                      required 
                      type="text" 
                      className="w-full p-2 border border-slate-300 rounded-lg" 
                      value={newClient.customGoal} 
                      onChange={e => setNewClient({...newClient, customGoal: e.target.value})}
                      placeholder="e.g., Improve marathon time"
                    />
                  </div>
                )}
                <button 
                  type="button"
                  onClick={() => setShowAdvancedFields(!showAdvancedFields)}
                  className="w-full py-2 border-2 border-slate-300 text-slate-700 font-bold rounded-lg hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
                >
                  {showAdvancedFields ? 'Hide' : 'Show'} Advanced Fields
                  {showAdvancedFields ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {showAdvancedFields && (
                  <div className="space-y-3 pt-2 border-t border-slate-200">
                    <h4 className="text-xs font-bold text-slate-600 uppercase">Records Information (Optional)</h4>
                    <div>
                      <label className="text-xs font-bold text-slate-700 uppercase">Medical History</label>
                      <textarea 
                        value={newClient.medicalHistory}
                        onChange={e => setNewClient({...newClient, medicalHistory: e.target.value})}
                        className="w-full p-2 border border-slate-300 rounded-lg text-sm h-20 resize-none"
                        placeholder="e.g., Diabetes Type 2, Hypertension..."
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-700 uppercase">Allergies</label>
                      <textarea 
                        value={newClient.allergies}
                        onChange={e => setNewClient({...newClient, allergies: e.target.value})}
                        className="w-full p-2 border border-slate-300 rounded-lg text-sm h-16 resize-none"
                        placeholder="e.g., Peanuts, Shellfish..."
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-700 uppercase">Medications</label>
                      <textarea 
                        value={newClient.medications}
                        onChange={e => setNewClient({...newClient, medications: e.target.value})}
                        className="w-full p-2 border border-slate-300 rounded-lg text-sm h-16 resize-none"
                        placeholder="e.g., Metformin 500mg, Lisinopril 10mg..."
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-700 uppercase">Dietary History</label>
                      <textarea 
                        value={newClient.dietaryHistory}
                        onChange={e => setNewClient({...newClient, dietaryHistory: e.target.value})}
                        className="w-full p-2 border border-slate-300 rounded-lg text-sm h-20 resize-none"
                        placeholder="e.g., Previously tried keto, dislikes cilantro..."
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-700 uppercase">Social Background</label>
                      <textarea 
                        value={newClient.socialBackground}
                        onChange={e => setNewClient({...newClient, socialBackground: e.target.value})}
                        className="w-full p-2 border border-slate-300 rounded-lg text-sm h-20 resize-none"
                        placeholder="e.g., Works night shifts, lives with family, cultural dietary restrictions..."
                      />
                    </div>
                  </div>
                )}
                <button type="submit" disabled={submitting} className="w-full py-2 bg-[#8C3A36] text-white font-bold rounded-lg hover:bg-[#7a2f2b] transition-colors">
                   {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto"/> : "Create Client"}
                </button>
             </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={showDeleteConfirm}
        title="Delete Client"
        message="Are you sure you want to delete this client? This action cannot be undone."
        onConfirm={confirmDeleteClient}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setClientToDelete(null);
        }}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
};

export default ClientList;
