import React, { useState } from 'react';
import { ArrowRight, CheckCircle, Brain, Users, CreditCard, Shield, Play, UserCheck, MessageCircle, Heart, WheatOff, Activity, UserPlus, FileText, BarChart, Server, Link2, User as UserIcon, Scale, Droplet, Dumbbell, Menu, X } from 'lucide-react';

interface LandingPageProps {
  onLogin: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onLogin }) => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annually'>('monthly');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans">
      {/* Navigation */}
      <nav className="fixed w-full z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 md:h-20 items-center">
            <a href="#home" className="flex items-center gap-2" onClick={() => setMobileMenuOpen(false)}>
              <img src="https://nutritherapy.co.ke/wp-content/uploads/2024/08/Untitled-design-2024-08-28T154953.396.png" alt="NutriTherapy Solutions Logo" className="h-10 md:h-12" />
            </a>
            <div className="hidden md:flex items-center space-x-8">
              <a href="#features" className="text-slate-600 hover:text-[#8C3A36] text-sm font-medium transition-colors">Features</a>
              <a href="#workflow" className="text-slate-600 hover:text-[#8C3A36] text-sm font-medium transition-colors">Workflow</a>
              <a href="#pricing" className="text-slate-600 hover:text-[#8C3A36] text-sm font-medium transition-colors">Pricing</a>
              <a href="#testimonials" className="text-slate-600 hover:text-[#8C3A36] text-sm font-medium transition-colors">Testimonials</a>
              <a href="#/articles" className="text-slate-600 hover:text-[#8C3A36] text-sm font-medium transition-colors">Articles</a>
            </div>
             <div className="hidden md:flex items-center space-x-4">
              <button onClick={onLogin} className="text-slate-900 hover:text-[#8C3A36] text-sm font-medium">Log In</button>
              <button onClick={onLogin} className="bg-[#8C3A36] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#7a2f2b] transition-colors shadow-lg shadow-[#8C3A36]/20">Start Free Trial</button>
            </div>
            <button 
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-slate-600 hover:text-[#8C3A36]"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
        
        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white animate-in slide-in-from-top duration-200">
            <div className="px-4 py-4 space-y-4">
              <a 
                href="#features" 
                onClick={() => setMobileMenuOpen(false)}
                className="block text-slate-600 hover:text-[#8C3A36] text-base font-medium transition-colors py-2"
              >
                Features
              </a>
              <a 
                href="#workflow" 
                onClick={() => setMobileMenuOpen(false)}
                className="block text-slate-600 hover:text-[#8C3A36] text-base font-medium transition-colors py-2"
              >
                Workflow
              </a>
              <a 
                href="#pricing" 
                onClick={() => setMobileMenuOpen(false)}
                className="block text-slate-600 hover:text-[#8C3A36] text-base font-medium transition-colors py-2"
              >
                Pricing
              </a>
              <a 
                href="#testimonials" 
                onClick={() => setMobileMenuOpen(false)}
                className="block text-slate-600 hover:text-[#8C3A36] text-base font-medium transition-colors py-2"
              >
                Testimonials
              </a>
              <a 
                href="#/articles" 
                onClick={() => setMobileMenuOpen(false)}
                className="block text-slate-600 hover:text-[#8C3A36] text-base font-medium transition-colors py-2"
              >
                Articles
              </a>
              <div className="pt-4 border-t border-slate-200 space-y-3">
                <button 
                  onClick={() => { setMobileMenuOpen(false); onLogin(); }} 
                  className="w-full text-left text-slate-900 hover:text-[#8C3A36] text-base font-medium py-2"
                >
                  Log In
                </button>
                <button 
                  onClick={() => { setMobileMenuOpen(false); onLogin(); }} 
                  className="w-full bg-[#8C3A36] text-white px-4 py-3 rounded-lg text-base font-medium hover:bg-[#7a2f2b] transition-colors shadow-lg shadow-[#8C3A36]/20"
                >
                  Start Free Trial
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section id="home" className="pt-24 pb-12 md:pt-32 md:pb-20 lg:pt-40 lg:pb-28 px-4 overflow-hidden relative">
        <div className="absolute top-0 right-0 -z-10 opacity-10 translate-x-1/3 -translate-y-1/4">
          <svg width="800" height="800" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
            <path fill="#8C3A36" d="M44.7,-76.4C58.9,-69.2,71.8,-59.1,81.6,-46.6C91.4,-34.1,98.1,-19.2,95.8,-5.3C93.5,8.6,82.2,21.5,70.6,31.9C59,42.3,47,50.2,34.6,57.6C22.2,65,9.4,71.9,-2.6,76.4C-14.6,80.9,-25.8,83,-37.4,79.7C-49,76.4,-61,67.7,-70.4,56.7C-79.8,45.7,-86.6,32.4,-87.5,18.8C-88.4,5.2,-83.4,-8.7,-75.5,-20.8C-67.6,-32.9,-56.8,-43.2,-44.8,-51.1C-32.8,-59,-19.6,-64.5,-5.9,-54.3L44.7,-76.4Z" transform="translate(100 100)" />
          </svg>
        </div>
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-[#F9F5F5] text-[#8C3A36] px-4 py-1.5 rounded-full text-sm font-medium mb-8 border border-stone-200">
            <span className="flex h-2 w-2 rounded-full bg-[#8FAA41] animate-pulse"></span>
            New: AI-Powered Meal Planning 2.5
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-slate-900 mb-4 md:mb-6">Transform Your <br className="hidden sm:block" /><span className="text-[#8FAA41]">Nutrition Practice</span></h1>
          <p className="text-base sm:text-lg md:text-xl text-slate-600 max-w-2xl mx-auto mb-8 md:mb-10 leading-relaxed px-4">Streamline client management, automate meal planning with AI, and grow your nutrition business with our comprehensive SaaS platform designed for modern nutritionists and dietitians.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <button onClick={onLogin} className="w-full sm:w-auto px-8 py-4 bg-[#8C3A36] text-white rounded-xl font-semibold hover:bg-[#7a2f2b] transition-all shadow-xl shadow-[#8C3A36]/20 flex items-center justify-center gap-2">Start Free Trial <ArrowRight className="w-5 h-5" /></button>
            <button className="w-full sm:w-auto px-8 py-4 bg-white text-slate-700 border border-slate-200 rounded-xl font-semibold hover:bg-slate-50 transition-all flex items-center justify-center gap-2"><Play className="w-5 h-5 fill-slate-700" /> Watch Demo</button>
          </div>
          <div className="mt-16 pt-8 border-t border-slate-100 flex flex-col md:flex-row justify-center items-center gap-8 text-slate-500 text-sm">
             <span className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-[#8FAA41]" /> No credit card required</span>
             <span className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-[#8FAA41]" /> 14-day free trial</span>
             <span className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-[#8FAA41]" /> HIPAA Compliant</span>
          </div>
        </div>
      </section>
      
      {/* Features Section */}
      <section id="features" className="py-12 md:py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-8 md:mb-16">
                <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-3 md:mb-4">All the tools you need to succeed</h2>
                <p className="text-slate-600 text-base sm:text-lg px-4">From intelligent automation to seamless client collaboration, we've got you covered.</p>
            </div>
            <div className="grid sm:grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 lg:gap-12">
                {/* AI Meal Planning */}
                <div className="bg-white rounded-xl md:rounded-2xl p-6 md:p-8 border shadow-sm">
                    <div className="inline-flex items-center gap-2 text-[#8C3A36] font-semibold mb-4"><Brain className="w-5 h-5" /> AI Meal Planning</div>
                    <p className="text-slate-600 mb-6">Our AI considers medical history, allergies, and preferences to generate personalized 7-day plans in seconds.</p>
                    <div className="w-full flex items-center justify-between gap-4 bg-slate-50 p-4 rounded-lg">
                        <div className="bg-white p-3 rounded-lg border shadow-md space-y-2 w-1/3"><h4 className="font-bold text-xs text-center text-slate-700">Client Data</h4><div className="flex items-center gap-1 p-1.5 bg-slate-50 rounded"><Activity className="w-3 h-3 text-[#8FAA41]" /> <span className="text-[10px]">Weight Loss</span></div><div className="flex items-center gap-1 p-1.5 bg-slate-50 rounded"><Heart className="w-3 h-3 text-rose-500" /> <span className="text-[10px]">Hypertension</span></div></div>
                        <div className="flex flex-col items-center gap-2"><ArrowRight className="w-6 h-6 text-slate-300" /><div className="p-2 bg-[#8C3A36] rounded-full shadow-md"><Brain className="w-5 h-5 text-white" /></div><ArrowRight className="w-6 h-6 text-slate-300" /></div>
                        <div className="bg-white p-3 rounded-lg border shadow-md space-y-2 w-1/2"><h4 className="font-bold text-xs text-slate-700">7-Day Meal Plan</h4><div className="p-1.5 bg-[#F9F5F5] rounded space-y-1"><div className="flex justify-between items-center"><span className="text-[10px] font-semibold">Mon</span><div className="h-1 w-8 bg-slate-200 rounded-full"></div></div><div className="flex justify-between items-center"><span className="text-[10px] font-semibold">...</span></div></div><div className="text-[10px] text-center font-bold text-[#8FAA41] bg-green-50 p-1 rounded">Generated</div></div>
                    </div>
                </div>

                {/* All-in-One Client Hub */}
                <div className="bg-white rounded-xl md:rounded-2xl p-6 md:p-8 border shadow-sm">
                    <div className="inline-flex items-center gap-2 text-[#8C3A36] font-semibold mb-4"><Users className="w-5 h-5" /> Client Hub</div>
                    <p className="text-slate-600 mb-6">Get a 360° view of each client. Track progress, schedule appointments, and manage billing from one dashboard.</p>
                    <div className="bg-slate-800 p-2 rounded-xl shadow-2xl relative transform -rotate-1">
                        <div className="aspect-[4/3] bg-white rounded-md p-3 space-y-3">
                           {/* Header */}
                           <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-[#8FAA41]/30 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-sm text-[#8FAA41]">NK</div>
                              <div>
                                 <div className="h-4 bg-slate-300 rounded w-24"></div>
                                 <div className="h-2 bg-slate-200 rounded w-32 mt-1.5"></div>
                              </div>
                           </div>
                           {/* Tabs */}
                           <div className="flex items-center border-b border-slate-200 text-xs">
                              <div className="px-2 py-1.5 border-b-2 border-[#8C3A36] text-[#8C3A36] font-semibold">Overview</div>
                              <div className="px-2 py-1.5 text-slate-400">Meal Plans</div>
                              <div className="px-2 py-1.5 text-slate-400">Messages</div>
                           </div>
                           {/* Stats */}
                           <div className="grid grid-cols-4 gap-2 text-center">
                              {[
                                {icon: UserIcon, label: 'AGE', value: '30'},
                                {icon: Scale, label: 'WEIGHT', value: '70kg'},
                                {icon: Droplet, label: 'BODY FAT', value: 'N/A'},
                                {icon: Dumbbell, label: 'MUSCLE', value: 'N/A'},
                              ].map((stat, i) => (
                                <div key={i} className="bg-slate-50 p-1.5 rounded-md border">
                                    <stat.icon className="w-3 h-3 mx-auto text-slate-400"/>
                                    <p className="text-[8px] font-bold text-slate-500 mt-1">{stat.label}</p>
                                    <p className="text-[10px] font-bold text-slate-800">{stat.value}</p>
                                </div>
                              ))}
                           </div>
                           {/* AI Insights */}
                           <div className="bg-slate-50 p-2 rounded-md border">
                              <p className="text-[10px] font-bold text-slate-800 flex items-center gap-1"><Brain className="w-3 h-3 text-[#8C3A36]"/> AI Coach Insights</p>
                              <div className="space-y-1 mt-1">
                                <div className="h-1.5 bg-slate-200 rounded-full w-full"></div>
                                <div className="h-1.5 bg-slate-200 rounded-full w-5/6"></div>
                              </div>
                           </div>
                        </div>
                    </div>
                </div>

                {/* Interactive Client Portal */}
                <div className="bg-white rounded-xl md:rounded-2xl p-6 md:p-8 border shadow-sm">
                    <div className="inline-flex items-center gap-2 text-[#8C3A36] font-semibold mb-4"><Link2 className="w-5 h-5" /> Client Portal</div>
                    <p className="text-slate-600 mb-6">Empower clients with a secure portal to log meals, track progress, and message you directly, syncing data in real-time.</p>
                    <div className="w-full flex items-center justify-between gap-4 bg-slate-50 p-4 rounded-lg">
                        <div className="bg-slate-800 p-1.5 rounded-lg w-1/3 shadow-lg"><div className="bg-white p-2 rounded-sm"><h4 className="text-xs font-bold text-slate-700">Client Food Log</h4><div className="mt-2 bg-slate-100 p-1.5 rounded"><div className="w-full h-8 bg-slate-300 rounded-sm"></div><p className="text-[9px] mt-1">Chicken Salad wrap...</p></div></div></div>
                        <Server className="w-12 h-12 text-slate-300 flex-shrink-0" />
                        <div className="bg-white p-3 rounded-lg border shadow-md w-1/2"><h4 className="font-bold text-xs text-slate-700">Nutritionist View</h4><div className="mt-2 p-1.5 bg-slate-50 rounded flex items-center gap-2"><div className="w-6 h-6 bg-slate-200 rounded"></div><p className="text-[10px] flex-1">New food log from Jane</p></div></div>
                    </div>
                </div>

                {/* Automated Billing */}
                <div className="bg-white rounded-xl md:rounded-2xl p-6 md:p-8 border shadow-sm">
                    <div className="inline-flex items-center gap-2 text-[#8C3A36] font-semibold mb-4"><CreditCard className="w-5 h-5" /> Automated Billing</div>
                    <p className="text-slate-600 mb-6">Create and send invoices automatically. Accept online payments through a secure client portal to save time.</p>
                    <div className="w-full flex items-center justify-around gap-2 bg-slate-50 p-4 rounded-lg text-center">
                        <div className="flex flex-col items-center gap-2"><div className="bg-white border rounded-full p-2"><FileText className="w-5 h-5 text-slate-600" /></div><p className="text-xs font-semibold">Invoice</p></div>
                        <ArrowRight className="w-5 h-5 text-slate-300" />
                        <div className="flex flex-col items-center gap-2"><div className="bg-white border rounded-full p-2"><MessageCircle className="w-5 h-5 text-slate-600" /></div><p className="text-xs font-semibold">Client Pays</p></div>
                        <ArrowRight className="w-5 h-5 text-slate-300" />
                        <div className="flex flex-col items-center gap-2"><div className="bg-white border rounded-full p-2"><CheckCircle className="w-5 h-5 text-[#8FAA41]" /></div><p className="text-xs font-semibold">Confirmed</p></div>
                    </div>
                </div>
            </div>
        </div>
      </section>

       {/* Workflow Infographic */}
      <section id="workflow" className="py-12 md:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-8 md:mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-3 md:mb-4">Your Streamlined Workflow</h2>
            <p className="text-slate-600 text-base sm:text-lg px-4">From onboarding to billing, everything is connected to save you time and improve client outcomes.</p>
          </div>
          <div className="relative">
            <div className="hidden md:block absolute top-10 left-0 w-full h-px border-t-2 border-dashed border-slate-300"></div>
            <div className="relative grid md:grid-cols-5 gap-y-12 md:gap-x-8">
              {[
                { icon: UserPlus, title: "1. Onboard Client", desc: "Add new clients with comprehensive medical and lifestyle profiles." },
                { icon: Brain, title: "2. Generate Plan", desc: "Instantly create personalized meal plans with our advanced AI." },
                { icon: Activity, title: "3. Track Progress", desc: "Monitor weight, body composition, and food logs via the client portal." },
                { icon: MessageCircle, title: "4. Communicate", desc: "Engage with clients using secure, real-time messaging." },
                { icon: CreditCard, title: "5. Bill & Get Paid", desc: "Automate invoicing and accept online payments seamlessly." },
              ].map((step, idx) => (
                <div key={idx} className="text-center flex flex-col items-center">
                  <div className="bg-white border-2 border-slate-200 w-20 h-20 rounded-full flex items-center justify-center z-10 shadow-lg"><div className="bg-[#8C3A36] text-white w-16 h-16 rounded-full flex items-center justify-center"><step.icon className="w-8 h-8"/></div></div>
                  <h3 className="mt-4 text-lg font-bold text-slate-900">{step.title}</h3>
                  <p className="text-slate-600 text-sm mt-1 max-w-xs">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-12 md:py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-8 md:mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-3 md:mb-4">Find the perfect plan</h2>
            <p className="text-slate-600 text-base sm:text-lg px-4">Start for free and scale as you grow. All plans include a 14-day free trial.</p>
          </div>
          <div className="flex justify-center items-center gap-4 mb-12">
            <span className={`font-medium ${billingCycle === 'monthly' ? 'text-[#8C3A36]' : 'text-slate-500'}`}>Monthly</span>
            <button onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'annually' : 'monthly')} className="w-12 h-6 rounded-full bg-slate-200 flex items-center p-1 transition-colors"><div className={`w-5 h-5 rounded-full bg-white shadow transform transition-transform ${billingCycle === 'annually' ? 'translate-x-5' : 'translate-x-0'}`}></div></button>
            <span className={`font-medium ${billingCycle === 'annually' ? 'text-[#8C3A36]' : 'text-slate-500'}`}>Annually</span>
            <span className="text-xs bg-green-100 text-green-800 font-bold px-2 py-0.5 rounded-full">Save 20%</span>
          </div>

          <div className="grid sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 items-start">
            {[{
              name: "Starter",
              price: { monthly: 29, annually: 23 },
              desc: "For individual practitioners getting started.",
              features: ["Up to 25 Active Clients", "AI Meal Plan Generator", "Client Progress Tracking", "Secure Messaging"],
              isPopular: false
            },{
              name: "Pro",
              price: { monthly: 59, annually: 47 },
              desc: "For growing practices that need more power.",
              features: ["Up to 100 Active Clients", "All Starter Features", "Automated Billing & Invoicing", "Advanced Analytics", "HIPAA Compliance"],
              isPopular: true
            },{
              name: "Business",
              price: { monthly: 99, annually: 79 },
              desc: "For established clinics and teams.",
              features: ["Unlimited Clients", "All Pro Features", "Team Member Accounts", "White-label Client Portal", "Priority Support"],
              isPopular: false
            }].map(plan => (
              <div key={plan.name} className={`bg-white rounded-xl md:rounded-2xl p-6 md:p-8 border ${plan.isPopular ? 'border-[#8C3A36] shadow-2xl' : 'shadow-sm'}`}>
                {plan.isPopular && <div className="text-center mb-6"><span className="bg-[#8C3A36] text-white text-xs font-bold px-3 py-1 rounded-full">MOST POPULAR</span></div>}
                <h3 className="text-2xl font-bold text-center mb-2">{plan.name}</h3>
                <p className="text-slate-500 text-center mb-6">{plan.desc}</p>
                <div className="text-center mb-8">
                  <span className="text-5xl font-bold">${billingCycle === 'monthly' ? plan.price.monthly : plan.price.annually}</span>
                  <span className="text-slate-500">/ month</span>
                </div>
                <ul className="space-y-4 mb-8">
                  {plan.features.map(feat => <li key={feat} className="flex items-center gap-3"><CheckCircle className="w-5 h-5 text-[#8FAA41]" /><span className="text-slate-700">{feat}</span></li>)}
                </ul>
                <button onClick={onLogin} className={`w-full py-3 rounded-lg font-semibold ${plan.isPopular ? 'bg-[#8C3A36] text-white' : 'bg-slate-100 text-slate-800 hover:bg-slate-200'}`}>Get Started</button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-12 md:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-8 md:mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-3 md:mb-4">Trusted by professionals like you</h2>
            <p className="text-slate-600 text-base sm:text-lg px-4">See how NutriTherapy Solutions is helping nutritionists streamline their practice and deliver better results.</p>
          </div>
          <div className="grid sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {[
              { quote: "NutriTherapy has transformed how I manage my practice. The AI meal planning saves me hours each week, allowing me to focus more on my clients.", author: "Dr. Sarah Johnson", role: "Licensed Nutritionist" },
              { quote: "The client portal and progress tracking features have significantly improved client engagement and accountability. It's a game-changer.", author: "Mark Thompson", role: "Registered Dietitian" },
              { quote: "Payment integration is seamless. My clients love the convenience of online payments, and it's made my accounting so much easier.", author: "Lisa Chen", role: "Sports Nutritionist" }
            ].map((t, i) => (
              <div key={i} className="bg-white p-6 md:p-8 rounded-xl md:rounded-2xl shadow-sm border border-slate-100">
                <div className="flex text-[#8FAA41] mb-4">{[1,2,3,4,5].map(star => <svg key={star} className="w-5 h-5 fill-current" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>)}</div>
                <p className="text-slate-700 mb-6 italic">"{t.quote}"</p>
                <div><p className="font-bold text-slate-900">{t.author}</p><p className="text-slate-500 text-sm">{t.role}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-12 md:py-20 bg-[#F9F5F5]">
         <div className="max-w-4xl mx-auto px-4 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 md:mb-6 text-slate-900">Ready to Transform Your Practice?</h2>
            <p className="text-slate-600 text-lg sm:text-xl mb-8 md:mb-10">Join thousands of nutrition professionals who trust NutriTherapy Solutions to streamline their workflow and improve client outcomes.</p>
            <button onClick={onLogin} className="bg-[#8C3A36] text-white px-10 py-4 rounded-xl font-bold text-lg hover:bg-[#7a2f2b] transition-colors shadow-2xl shadow-[#8C3A36]/20">Start Your 14-Day Free Trial</button>
         </div>
      </section>

      <footer className="bg-slate-900 text-slate-400 py-16 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <a href="#home" className="inline-block mb-8">
                <img src="https://nutritherapy.co.ke/wp-content/uploads/2024/08/7e3cca79-563d-4b42-babb-5e96a6ff0b6e.png" alt="NutriTherapy Solutions Logo" className="h-12" />
            </a>
            <div className="flex justify-center items-center gap-8 mb-8">
              <a href="#features" className="hover:text-white transition-colors">Features</a>
              <a href="#workflow" className="hover:text-white transition-colors">Workflow</a>
              <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
              <a href="#testimonials" className="hover:text-white transition-colors">Testimonials</a>
            </div>
            <p className="text-sm">&copy; {new Date().getFullYear()} NutriTherapy Solutions. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;