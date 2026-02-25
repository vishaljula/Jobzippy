/**
 * types.ts — shared types for the job agent
 */

export interface AgentProfile {
    identity: {
        first_name: string;
        last_name: string;
        email: string;
        phone: string;
        address: string;
    };
    work_auth: {
        visa_type: string;
        sponsorship_required: boolean;
    };
    preferences: {
        remote: boolean;
        locations: string[];
        salary_min: number;
        salary_currency: string;
        target_roles: string[];
        experience_level: string;
        job_type: string;
        work_arrangement: string;
    };
    employment: Array<{
        company: string;
        title: string;
        start: string;
        end: string;
        duties: string;
        city: string;
        state: string;
    }>;
    education: Array<{
        school: string;
        degree: string;
        field: string;
        start: string;
        end: string;
    }>;
    compliance: {
        veteran_status?: string;
        disability_status?: string;
    };
}

export interface ScrapedJob {
    title: string;
    company: string;
    location: string;
    url: string;
    description: string;
    isEasyApply: boolean;
    postedDate?: string;
}

export interface ApplicationResult {
    job: ScrapedJob;
    status: 'applied' | 'skipped' | 'error';
    reason?: string;
    screenshotPath?: string;
    appliedAt?: string;
}

export interface FillAction {
    field: string;
    value: string;
}
