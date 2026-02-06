import type { Email } from '@/types/email';

export const mockEmails: Email[] = [
  {
    id: '1',
    from: {
      name: 'Sarah Johnson',
      email: 'sarah.j@techcorp.com'
    },
    to: [
      { name: 'Benne', email: 'bennet@example.com' }
    ],
    subject: 'Q4 Marketing Strategy Review',
    preview: 'Hi Benne, I wanted to share the latest marketing metrics and discuss our strategy for the upcoming quarter...',
    content: `<p>Hi Benne,</p>
    <p>I wanted to share the latest marketing metrics and discuss our strategy for the upcoming quarter. We've seen some excellent results from our recent campaigns:</p>
    <ul>
      <li>Conversion rate increased by 23%</li>
      <li>Customer acquisition cost decreased by 15%</li>
      <li>Brand awareness metrics up 40% YoY</li>
    </ul>
    <p>I've attached the detailed report for your review. Can we schedule a meeting next week to discuss the Q1 2024 strategy?</p>
    <p>Best regards,<br/>Sarah</p>`,
    contentType: 'html',
    timestamp: new Date('2024-01-23T09:30:00'),
    isRead: false,
    isStarred: true,
    labels: ['Important', 'Marketing'],
    aiAnalysis: 'This is a high-priority business email discussing Q4 marketing performance and requesting a strategy meeting. The sender reports positive metrics and wants to plan for Q1 2024. Response recommended within 24 hours.',
    attachments: [
      { name: 'Q4_Marketing_Report.pdf', size: 2457600, type: 'application/pdf' },
      { name: 'Metrics_Dashboard.xlsx', size: 524288, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
    ]
  },
  {
    id: '2',
    from: {
      name: 'Michael Chen',
      email: 'mchen@designstudio.io'
    },
    to: [
      { name: 'Benne', email: 'bennet@example.com' }
    ],
    subject: 'New Website Design Mockups Ready',
    preview: 'Hey! The initial mockups for the website redesign are ready for review. I\'ve incorporated all the feedback from our last meeting...',
    content: `Hey!

The initial mockups for the website redesign are ready for review. I've incorporated all the feedback from our last meeting:

✅ Modern, clean layout
✅ Improved mobile responsiveness  
✅ Better accessibility features
✅ Enhanced user navigation flow

You can view the interactive prototypes here: [design-studio.io/project/zen-ai](https://design-studio.io/project/zen-ai)

Key highlights:
- Homepage redesign with hero section
- Product pages with improved filtering
- Blog layout with better readability
- Contact form with validation

Let me know your thoughts and we can iterate from there. I'm available for a call this Thursday or Friday if you'd like to walk through the designs together.

Cheers,
Michael`,
    contentType: 'text',
    timestamp: new Date('2024-01-23T08:15:00'),
    isRead: true,
    isStarred: false,
    labels: ['Design', 'Website'],
    aiAnalysis: 'Design update email with website mockups ready for review. The designer has completed initial designs based on previous feedback and is requesting feedback or a meeting. Low urgency but important for project timeline.',
    attachments: [
      { name: 'Homepage_Mockup.fig', size: 15728640, type: 'application/figma' },
      { name: 'Mobile_Wireframes.sketch', size: 8388608, type: 'application/sketch' }
    ]
  },
  {
    id: '3',
    from: {
      name: 'Emily Rodriguez',
      email: 'emily.r@venturecapital.com'
    },
    to: [
      { name: 'Benne', email: 'bennet@example.com' }
    ],
    subject: 'Investment Opportunity - AI Startup',
    preview: 'I hope this email finds you well. I\'m reaching out about an exciting investment opportunity in an AI startup that aligns perfectly with your expertise...',
    content: `<p>Dear Benne,</p>
    <p>I hope this email finds you well. I'm reaching out about an exciting investment opportunity in an AI startup that aligns perfectly with your expertise in artificial intelligence and machine learning.</p>
    <p><strong>Company Overview:</strong></p>
    <p>NeuralFlow AI is developing breakthrough technology in natural language processing and has secured initial funding from prominent angel investors. They're currently raising their Series A round.</p>
    <p><strong>Key Metrics:</strong></p>
    <ul>
      <li>$2.5M ARR (growing 40% MoM)</li>
      <li>500+ enterprise customers</li>
      <li>Proprietary NLP technology</li>
      <li>Strong team of AI researchers from top universities</li>
    </ul>
    <p>Given your background in AI, I thought you might be interested in either investing or potentially joining as an advisor. The founders are particularly interested in your expertise.</p>
    <p>Would you be open to a confidential discussion next week?</p>
    <p>Best regards,<br/>Emily Rodriguez<br/>Managing Partner, Venture Capital Partners</p>`,
    contentType: 'html',
    timestamp: new Date('2024-01-22T16:45:00'),
    isRead: false,
    isStarred: true,
    labels: ['Investment', 'AI', 'High Priority'],
    aiAnalysis: 'High-value investment opportunity email from venture capital firm. The sender is proposing investment in an AI startup with strong metrics and specifically values the recipient\'s AI expertise. This could be a significant business opportunity requiring careful consideration.',
    attachments: []
  },
  {
    id: '4',
    from: {
      name: 'Alex Thompson',
      email: 'alex@devteam.com'
    },
    to: [
      { name: 'Benne', email: 'bennet@example.com' }
    ],
    subject: 'Sprint Planning - Next Week',
    preview: 'Hi team, Just a reminder that we have sprint planning scheduled for next Monday at 10 AM. Please make sure your user stories are updated...',
    content: `Hi team,

Just a reminder that we have sprint planning scheduled for next Monday at 10 AM. Please make sure your user stories are updated in Jira.

Sprint Goals:
- Complete user authentication module
- Implement real-time chat features
- Fix critical bugs from previous sprint
- Improve dashboard performance

Preparation:
1. Update your user stories with acceptance criteria
2. Estimate story points (we'll use planning poker)
3. Identify any dependencies or blockers
4. Review the product backlog

Agenda:
- Retro on previous sprint (30 min)
- Sprint goal setting (15 min)
- Story estimation (60 min)
- Capacity planning (15 min)

Please come prepared to discuss your capacity and any potential impediments.

Thanks,
Alex`,
    contentType: 'text',
    timestamp: new Date('2024-01-22T14:20:00'),
    isRead: true,
    isStarred: false,
    labels: ['Development', 'Sprint'],
    aiAnalysis: 'Internal team email about sprint planning. This is a routine operational email with clear action items and preparation requirements. Standard priority for development team coordination.',
    attachments: []
  },
  {
    id: '5',
    from: {
      name: 'Lisa Wang',
      email: 'lwang@legalcounsel.com'
    },
    to: [
      { name: 'Benne', email: 'bennet@example.com' }
    ],
    subject: 'Contract Review - Tech Partnership Agreement',
    preview: 'Dear Benne, I\'ve completed the initial review of the technology partnership agreement with InnovateCorp. There are several clauses that require your attention...',
    content: `<p>Dear Benne,</p>
    <p>I've completed the initial review of the technology partnership agreement with InnovateCorp. There are several clauses that require your attention:</p>
    <p><strong>Key Issues Identified:</strong></p>
    <ol>
      <li><strong>Intellectual Property Rights:</strong> Section 4.2 needs clarification regarding ownership of jointly developed IP</li>
      <li><strong>Liability Caps:</strong> Current limits may be insufficient for potential damages</li>
      <li><strong>Termination Clause:</strong> 30-day notice period may be too short for complex disengagement</li>
      <li><strong>Confidentiality:</strong> Definition of confidential information needs to be more specific</li>
    </ol>
    <p><strong>Recommendations:</strong></p>
    <ul>
      <li>Negotiate higher liability caps (minimum $5M)</li>
      <li>Extend termination notice to 90 days</li>
      <li>Add specific IP ownership provisions</li>
      <li>Include audit rights for compliance verification</li>
    </ul>
    <p>I've attached a marked-up version with my comments. Please review and let me know if you'd like me to proceed with negotiations or if you have other concerns.</p>
    <p>Best regards,<br/>Lisa Wang<br/>Senior Legal Counsel</p>`,
    contentType: 'html',
    timestamp: new Date('2024-01-22T11:30:00'),
    isRead: false,
    isStarred: false,
    labels: ['Legal', 'Contract'],
    aiAnalysis: 'Legal review email identifying important issues in a partnership agreement. The attorney has flagged critical clauses requiring attention and provided specific recommendations. This requires careful review and timely response to protect business interests.',
    attachments: [
      { name: 'Partnership_Agreement_MarkedUp.pdf', size: 1048576, type: 'application/pdf' },
      { name: 'Legal_Notes.docx', size: 262144, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
    ]
  }
];