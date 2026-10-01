// Report request form — version 1.
// Answers are saved as-is in reports.inputs (jsonb). When questions change,
// bump FORM_VERSION so old and new submissions can be told apart (the AI will need this).
export const FORM_VERSION = 1

export const OPTIONS = {
  entity_type: ['Proprietorship', 'Partnership', 'LLP', 'Private Limited', 'Public Limited', 'One Person Company', 'Not yet registered', 'Other'],
  industry: [
    'Manufacturing', 'Food Processing', 'Textiles & Apparel', 'Agriculture & Allied', 'IT & Software',
    'Electronics', 'Healthcare & Pharma', 'Retail & Trading', 'Services', 'Tourism & Hospitality',
    'Logistics', 'Renewable Energy', 'Construction & Real Estate', 'Education & Skilling', 'Handicrafts', 'Other',
  ],
  state: [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
    'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
    'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
    'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman & Nicobar Islands', 'Chandigarh',
    'Dadra & Nagar Haveli and Daman & Diu', 'Delhi', 'Jammu & Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
  ],
  business_stage: ['Idea / planning', 'Started less than 3 years ago', 'Operating 3+ years', 'Expanding'],
  annual_turnover: ['Not started', 'Below ₹40 lakh', '₹40 lakh – ₹5 crore', '₹5 – ₹50 crore', '₹50 – ₹250 crore', 'Above ₹250 crore'],
  employees: ['1–5', '6–20', '21–50', '51–200', '200+'],
  yes_no: ['Yes', 'No', 'Applied / in progress'],
  owner_category: ['Women-led', 'SC / ST entrepreneur', 'Ex-serviceman', 'Person with disability', 'Minority community', 'First-generation entrepreneur', 'None of these'],
  purpose: [
    'Set up a new unit', 'Expand existing business', 'Buy machinery / upgrade technology', 'Working capital',
    'Start or grow exports', 'R&D / innovation / patents', 'Hiring & skilling', 'Solar / green / energy saving', 'Marketing & branding',
  ],
  investment: ['Below ₹10 lakh', '₹10 – ₹50 lakh', '₹50 lakh – ₹1 crore', '₹1 – ₹5 crore', 'Above ₹5 crore', 'Not sure yet'],
  support_type: ['Capital subsidy', 'Interest subsidy', 'Collateral-free loan', 'Grant', 'Tax / GST incentive', 'Any support'],
}

export const emptyForm = (profile) => ({
  // 1. Business
  business_name: profile?.business_name || '',
  entity_type: '',
  industry: '',
  sub_sector: '',
  state: '',
  city: '',
  year_established: '',
  business_stage: '',
  // 2. Size & registrations
  annual_turnover: '',
  employees: '',
  udyam_registered: '',
  gst_registered: '',
  dpiit_startup: '',
  exporter: '',
  // 3. Owner profile (optional)
  owner_category: [],
  // 4. Requirement
  purpose: [],
  planned_investment: '',
  support_type: [],
  description: '',
  // 5. Delivery
  delivery_email: profile?.email || '',
  contact_mobile: profile?.mobile || '',
})
