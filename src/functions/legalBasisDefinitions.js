export const LEGAL_BASES = {
    GDPR: [
        { id: "consent",             label: "Consent (Art. 6(1)(a))" },
        { id: "contract",            label: "Contract (Art. 6(1)(b))" },
        { id: "legal_obligation",    label: "Legal Obligation (Art. 6(1)(c))" },
        { id: "vital_interest",      label: "Vital Interests (Art. 6(1)(d))" },
        { id: "public_task",         label: "Public Task (Art. 6(1)(e))" },
        { id: "legitimate_interest", label: "Legitimate Interests (Art. 6(1)(f))" },
    ],
    LGPD: [
        { id: "consent",             label: "Consent (Art. 7(I))" },
        { id: "legal_obligation",    label: "Legal / Regulatory Obligation (Art. 7(II))" },
        { id: "public_policy",       label: "Public Policy Administration (Art. 7(III))" },
        { id: "research",            label: "Research by Research Entity (Art. 7(IV))" },
        { id: "contract",            label: "Contract Performance (Art. 7(V))" },
        { id: "legal_proceedings",   label: "Exercise of Rights in Legal Proceedings (Art. 7(VI))" },
        { id: "vital_interest",      label: "Vital Interests (Art. 7(VII))" },
        { id: "health_protection",   label: "Health Protection (Art. 7(VIII))" },
        { id: "legitimate_interest", label: "Legitimate Interests (Art. 7(IX))" },
        { id: "credit_protection",   label: "Credit Protection (Art. 7(X))" },
    ],
    PDPA: [
        { id: "consent",             label: "Consent (S. 19)" },
        { id: "contract",            label: "Contract (S. 24(1))" },
        { id: "vital_interest",      label: "Vital Interests (S. 24(2))" },
        { id: "public_interest",     label: "Public Interest (S. 24(3))" },
        { id: "legitimate_interest", label: "Legitimate Interests (S. 24(4))" },
        { id: "legal_obligation",    label: "Legal Obligation (S. 24(5))" },
    ],
    CCPA: [
        { id: "opt_out",             label: "Opt-Out of Sale / Share" },
        { id: "service_provider",    label: "Service Provider Use" },
        { id: "contractor",          label: "Contractor Use" },
    ],
    POPIA: [
        { id: "consent",             label: "Consent (S. 11(1)(a))" },
        { id: "contract",            label: "Contract (S. 11(1)(b))" },
        { id: "legal_obligation",    label: "Legal Obligation (S. 11(1)(c))" },
        { id: "vital_interest",      label: "Vital Interests (S. 11(1)(d))" },
        { id: "public_interest",     label: "Public Interest (S. 11(1)(e))" },
        { id: "legitimate_interest", label: "Legitimate Interests (S. 11(1)(f))" },
    ],
};

export const PROCESSING_PURPOSES = [
    { id: "analytics",       label: "Analytics & Performance" },
    { id: "marketing",       label: "Marketing & Advertising" },
    { id: "advertising",     label: "Targeted Advertising" },
    { id: "functional",      label: "Functional / Preferences" },
    { id: "personalisation", label: "Personalisation" },
    { id: "security",        label: "Security & Fraud Prevention" },
    { id: "payment",         label: "Payment Processing" },
    { id: "research",        label: "Research & Development" },
];

export const DEFAULT_LEGAL_BASIS = {
    GDPR:  { analytics: "legitimate_interest", marketing: "consent",   advertising: "consent",   functional: "legitimate_interest", personalisation: "consent",   security: "legitimate_interest", payment: "contract", research: "legitimate_interest" },
    LGPD:  { analytics: "legitimate_interest", marketing: "consent",   advertising: "consent",   functional: "legitimate_interest", personalisation: "consent",   security: "legitimate_interest", payment: "contract", research: "research" },
    PDPA:  { analytics: "legitimate_interest", marketing: "consent",   advertising: "consent",   functional: "legitimate_interest", personalisation: "consent",   security: "legitimate_interest", payment: "contract", research: "legitimate_interest" },
    CCPA:  { analytics: "opt_out",             marketing: "opt_out",   advertising: "opt_out",   functional: "service_provider",    personalisation: "opt_out",   security: "service_provider",    payment: "service_provider", research: "service_provider" },
    POPIA: { analytics: "legitimate_interest", marketing: "consent",   advertising: "consent",   functional: "legitimate_interest", personalisation: "consent",   security: "legitimate_interest", payment: "contract", research: "legitimate_interest" },
};
