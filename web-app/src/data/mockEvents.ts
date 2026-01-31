import type { CalendarEvent } from '@/types/calendar';

export const mockEvents: CalendarEvent[] = [
  // Current Date (set dynamically to current date)
  {
    id: '1',
    title: 'Morning Standup',
    description: 'Daily sync with the development team to discuss progress and blockers',
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 23, 9, 0, 0),
    end: new Date(new Date().getFullYear(), new Date().getMonth(), 23, 9, 30, 0),
    type: 'meeting',
    color: '#3b82f6',
    location: 'Conference Room A',
    attendees: ['Benne', 'Alex Chen', 'Sarah Johnson', 'Mike Wilson']
  },
  // Another event for today
  {
    id: '21',
    title: 'Design Review Meeting',
    description: 'Review new UI designs with the design team',
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 23, 14, 0, 0),
    end: new Date(new Date().getFullYear(), new Date().getMonth(), 23, 15, 30, 0),
    type: 'meeting',
    color: '#ec4899',
    location: 'Design Studio',
    attendees: ['Benne', 'Michael Chen', 'Design Team']
  },

  // Later today events
  {
    id: '22',
    title: 'Client Presentation',
    description: 'Present Q4 results to executive board',
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 23, 16, 0, 0),
    end: new Date(new Date().getFullYear(), new Date().getMonth(), 23, 17, 0, 0),
    type: 'meeting',
    color: '#f59e0b',
    location: 'Executive Boardroom',
    attendees: ['Benne', 'CEO', 'CFO', 'Board Members']
  },

  // Events throughout the month
  {
    id: '23',
    title: 'Workout Session',
    description: 'Evening workout at the gym',
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 24, 18, 30, 0),
    end: new Date(new Date().getFullYear(), new Date().getMonth(), 24, 19, 30, 0),
    type: 'personal',
    color: '#ef4444',
    location: 'Fitness Center'
  },
  {
    id: '24',
    title: 'Coffee Meeting',
    description: 'Informal discussion with mentor over coffee',
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 25, 10, 0, 0),
    end: new Date(new Date().getFullYear(), new Date().getMonth(), 25, 11, 0, 0),
    type: 'personal',
    color: '#8b5a2',
    location: 'Blue Bottle Coffee Shop'
  },
  {
    id: '25',
    title: 'Project Deadline - Mobile App',
    description: 'Submit final deliverables for mobile application',
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 26, 23, 59, 59),
    end: new Date(new Date().getFullYear(), new Date().getMonth(), 26, 23, 59, 59),
    type: 'task',
    color: '#dc2626',
    isAllDay: true
  },
  {
    id: '2',
    title: 'Product Roadmap Review',
    description: 'Review Q4 product roadmap and prioritize features for next quarter',
    start: new Date('2024-01-23T14:00:00'),
    end: new Date('2024-01-23T15:30:00'),
    type: 'meeting',
    color: '#8b5cf6',
    location: 'Main Conference Room',
    attendees: ['Benne', 'Product Team', 'Stakeholders', 'Design Team']
  },
  {
    id: '3',
    title: 'Code Review Session',
    description: 'Review PRs and discuss code quality improvements',
    start: new Date('2024-01-23T16:00:00'),
    end: new Date('2024-01-23T17:00:00'),
    type: 'meeting',
    color: '#f59e0b',
    location: 'Virtual - Google Meet',
    attendees: ['Benne', 'Dev Team']
  },

  // Tomorrow's Events
  {
    id: '4',
    title: 'Email Campaign Launch',
    description: 'Launch the winter marketing email campaign to 50K subscribers',
    start: new Date('2024-01-24T10:00:00'),
    end: new Date('2024-01-24T11:30:00'),
    type: 'task',
    color: '#10b981',
    location: 'Marketing Dashboard'
  },
  {
    id: '5',
    title: 'Client Presentation - TechCorp',
    description: 'Present AI solution proposal to TechCorp executive team',
    start: new Date('2024-01-24T15:00:00'),
    end: new Date('2024-01-24T16:30:00'),
    type: 'meeting',
    color: '#ec4899',
    location: 'TechCorp HQ - Conference Room B',
    attendees: ['Benne', 'Sarah Johnson', 'TechCorp Executives']
  },
  {
    id: '6',
    title: 'Happy Hour Team',
    description: 'Team happy hour at local brewery to celebrate recent wins',
    start: new Date('2024-01-24T18:00:00'),
    end: new Date('2024-01-24T20:00:00'),
    type: 'personal',
    color: '#06b6d4',
    location: 'The Craft Brewery',
    attendees: ['Benne', 'Entire Team']
  },

  // This Week
  {
    id: '7',
    title: 'Design Sprint Planning',
    description: 'Plan 2-week design sprint for new mobile app features',
    start: new Date('2024-01-25T10:00:00'),
    end: new Date('2024-01-25T12:00:00'),
    type: 'meeting',
    color: '#ec4899',
    location: 'Design Studio',
    attendees: ['Benne', 'Michael Chen', 'Design Team']
  },
  {
    id: '8',
    title: 'Lunch with Investor',
    description: 'Lunch meeting with Emily Rodriguez to discuss Series A funding',
    start: new Date('2024-01-25T12:30:00'),
    end: new Date('2024-01-25T14:00:00'),
    type: 'meeting',
    color: '#f59e0b',
    location: 'Le Bernardin Restaurant',
    attendees: ['Benne', 'Emily Rodriguez', 'Legal Counsel']
  },
  {
    id: '9',
    title: 'User Testing Session',
    description: 'Conduct user testing for new AI features',
    start: new Date('2024-01-26T14:00:00'),
    end: new Date('2024-01-26T16:00:00'),
    type: 'task',
    color: '#10b981',
    location: 'User Testing Lab'
  },
  {
    id: '10',
    title: 'Gym - Strength Training',
    description: 'Weekly strength training session with personal trainer',
    start: new Date('2024-01-27T18:00:00'),
    end: new Date('2024-01-27T19:00:00'),
    type: 'personal',
    color: '#ef4444',
    location: 'FitLife Gym'
  },

  // End of Month
  {
    id: '11',
    title: 'Project Deadline - AI Platform',
    description: 'Submit final deliverables for Q4 AI platform project',
    start: new Date('2024-01-29T00:00:00'),
    end: new Date('2024-01-29T23:59:59'),
    type: 'task',
    color: '#dc2626',
    isAllDay: true
  },
  {
    id: '12',
    title: 'Board Meeting',
    description: 'Quarterly board meeting to present company results and strategy',
    start: new Date('2024-01-30T10:00:00'),
    end: new Date('2024-01-30T12:30:00'),
    type: 'meeting',
    color: '#8b5cf6',
    location: 'Board Room - Executive Floor',
    attendees: ['Benne', 'CEO', 'CFO', 'CTO', 'Board Members']
  },
  {
    id: '13',
    title: 'Team Building Retreat',
    description: 'Quarterly team building retreat with activities and dinner',
    start: new Date('2024-01-30T14:00:00'),
    end: new Date('2024-01-30T18:00:00'),
    type: 'personal',
    color: '#10b981',
    location: 'Mountain View Resort',
    attendees: ['Benne', 'Entire Company']
  },

  // Mixed events throughout month
  {
    id: '14',
    title: 'Doctor Appointment',
    description: 'Annual health checkup and physical',
    start: new Date('2024-01-15T10:00:00'),
    end: new Date('2024-01-15T11:00:00'),
    type: 'personal',
    color: '#06b6d4',
    location: 'City Medical Center'
  },
  {
    id: '15',
    title: 'React Conference',
    description: 'Annual React conference with workshops and networking',
    start: new Date('2024-01-10T09:00:00'),
    end: new Date('2024-01-12T18:00:00'),
    type: 'meeting',
    color: '#3b82f6',
    location: 'Convention Center',
    attendees: ['Benne', 'Dev Team', 'Industry Professionals']
  },
  {
    id: '16',
    title: 'Database Migration',
    description: 'Migrate production database to new AWS infrastructure',
    start: new Date('2024-01-20T22:00:00'),
    end: new Date('2024-01-21T02:00:00'),
    type: 'task',
    color: '#f59e0b',
    location: 'AWS Console'
  },
  {
    id: '17',
    title: 'Coffee Chat with Mentor',
    description: 'Monthly mentorship session over coffee',
    start: new Date('2024-01-08T15:00:00'),
    end: new Date('2024-01-08T16:00:00'),
    type: 'personal',
    color: '#ec4899',
    location: 'Blue Bottle Coffee'
  },
  {
    id: '18',
    title: 'Sprint Retrospective',
    description: 'Review completed sprint and identify improvements',
    start: new Date('2024-01-05T15:00:00'),
    end: new Date('2024-01-05T16:00:00'),
    type: 'meeting',
    color: '#8b5cf6',
    location: 'Team Room',
    attendees: ['Benne', 'Dev Team', 'Scrum Master']
  },
  {
    id: '19',
    title: 'Yoga Class',
    description: 'Weekly yoga and meditation session',
    start: new Date('2024-01-04T07:00:00'),
    end: new Date('2024-01-04T08:00:00'),
    type: 'personal',
    color: '#10b981',
    location: 'Zen Studio'
  },
  {
    id: '20',
    title: 'Tax Preparation',
    description: 'Meet with accountant to prepare tax documents',
    start: new Date('2024-01-17T13:00:00'),
    end: new Date('2024-01-17T14:30:00'),
    type: 'task',
    color: '#f59e0b',
    location: 'Accountant Office'
  }
];