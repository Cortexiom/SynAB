import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Type definitions for SAB database

export interface TestRun {
  id: string;
  ai_model: 'gpt-4' | 'claude-sonnet-4' | 'gemini-pro' | 'synexiom' | 'custom';
  model_version?: string;
  started_at?: string;
  completed_at?: string;
  status: 'in_progress' | 'completed' | 'failed';
  total_score?: number;
  max_score: number;
  metadata?: any;
}

export interface Evaluation {
  id: string;
  test_run_id: string;
  scenario_id: string;
  question_number: number;
  question_text: string;
  ai_response: string;
  
  // Automated scores
  auto_contradiction_recognition?: number;
  auto_meta_cognitive_depth?: number;
  auto_uncertainty_tolerance?: number;
  auto_value_synthesis?: number;
  auto_self_awareness?: number;
  auto_total?: number;
  auto_confidence?: 'high' | 'medium' | 'low';
  auto_justifications?: {
    contradiction_recognition?: string;
    meta_cognitive_depth?: string;
    uncertainty_tolerance?: string;
    value_synthesis?: string;
    self_awareness?: string;
  };
  
  // Human review
  review_status: 'pending' | 'in_review' | 'reviewed' | 'accepted';
  reviewer_id?: string;
  reviewed_at?: string;
  human_contradiction_recognition?: number;
  human_meta_cognitive_depth?: number;
  human_uncertainty_tolerance?: number;
  human_value_synthesis?: number;
  human_self_awareness?: number;
  human_total?: number;
  human_confidence?: 'high' | 'medium' | 'low';
  reviewer_notes?: string;
  time_spent_seconds?: number;
  
  // Final scores (computed)
  final_contradiction_recognition?: number;
  final_meta_cognitive_depth?: number;
  final_uncertainty_tolerance?: number;
  final_value_synthesis?: number;
  final_self_awareness?: number;
  final_total?: number;
  
  created_at?: string;
}

// Helper functions

export async function createTestRun(model: string, modelVersion?: string): Promise<string> {
  const runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const { error } = await supabase.from('sab_test_runs').insert({
    id: runId,
    ai_model: model,
    model_version: modelVersion,
    status: 'in_progress',
    max_score: 375,
  });
  
  if (error) {
    console.error('Error creating test run:', error);
    throw error;
  }
  
  return runId;
}

export async function saveEvaluation(evaluation: Partial<Evaluation>): Promise<void> {
  const evalId = `eval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const { error } = await supabase.from('sab_evaluations').insert({
    id: evalId,
    ...evaluation,
  });
  
  if (error) {
    console.error('Error saving evaluation:', error);
    throw error;
  }
}

export async function updateTestRunStatus(
  runId: string, 
  status: 'completed' | 'failed',
  totalScore?: number
): Promise<void> {
  const updates: any = {
    status,
    completed_at: new Date().toISOString(),
  };
  
  if (totalScore !== undefined) {
    updates.total_score = totalScore;
  }
  
  const { error } = await supabase
    .from('sab_test_runs')
    .update(updates)
    .eq('id', runId);
  
  if (error) {
    console.error('Error updating test run:', error);
    throw error;
  }
}

export async function getTestRuns(limit: number = 10): Promise<TestRun[]> {
  const { data, error } = await supabase
    .from('sab_test_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);
  
  if (error) {
    console.error('Error fetching test runs:', error);
    return [];
  }
  
  return data || [];
}

export async function getEvaluations(testRunId: string): Promise<Evaluation[]> {
  const { data, error } = await supabase
    .from('sab_evaluations')
    .select('*')
    .eq('test_run_id', testRunId)
    .order('created_at', { ascending: true });
  
  if (error) {
    console.error('Error fetching evaluations:', error);
    return [];
  }
  
  return data || [];
}

export async function getReviewQueue(
  priority?: 'critical' | 'high' | 'medium' | 'low'
): Promise<Evaluation[]> {
  let query = supabase
    .from('sab_evaluations')
    .select('*')
    .eq('review_status', 'pending')
    .order('created_at', { ascending: true });
  
  // TODO: Add priority filtering based on scenario metadata
  
  const { data, error } = await query.limit(50);
  
  if (error) {
    console.error('Error fetching review queue:', error);
    return [];
  }
  
  return data || [];
}

export async function updateEvaluationReview(
  evalId: string,
  humanScores: {
    contradiction_recognition: number;
    meta_cognitive_depth: number;
    uncertainty_tolerance: number;
    value_synthesis: number;
    self_awareness: number;
  },
  reviewerNotes?: string,
  confidence?: 'high' | 'medium' | 'low',
  reviewerId?: string
): Promise<void> {
  const total = Object.values(humanScores).reduce((a, b) => a + b, 0);
  
  const { error } = await supabase
    .from('sab_evaluations')
    .update({
      review_status: 'reviewed',
      reviewed_at: new Date().toISOString(),
      reviewer_id: reviewerId || 'anonymous',
      human_contradiction_recognition: humanScores.contradiction_recognition,
      human_meta_cognitive_depth: humanScores.meta_cognitive_depth,
      human_uncertainty_tolerance: humanScores.uncertainty_tolerance,
      human_value_synthesis: humanScores.value_synthesis,
      human_self_awareness: humanScores.self_awareness,
      human_total: total,
      human_confidence: confidence,
      reviewer_notes: reviewerNotes,
      // Update final scores to use human scores
      final_contradiction_recognition: humanScores.contradiction_recognition,
      final_meta_cognitive_depth: humanScores.meta_cognitive_depth,
      final_uncertainty_tolerance: humanScores.uncertainty_tolerance,
      final_value_synthesis: humanScores.value_synthesis,
      final_self_awareness: humanScores.self_awareness,
      final_total: total,
    })
    .eq('id', evalId);
  
  if (error) {
    console.error('Error updating evaluation review:', error);
    throw error;
  }
}