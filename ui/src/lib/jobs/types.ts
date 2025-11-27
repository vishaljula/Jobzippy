export interface JobMatch {
  id: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  url: string;
  tags: string[];
  jobTypes: string[];
  publishedAt: string;
  snippet: string;
  source: 'arbeitnow';
  status: 'queued' | 'applying' | 'in-progress' | 'completed' | 'rejected';
}

export interface JobSearchRequest {
  keywords?: string[];
  locations?: string[];
  remote?: boolean;
  limit?: number;
}
