import type { NextApiRequest, NextApiResponse } from 'next';
import * as anthropicAdapter from '../../lib/adapters/anthropic';
//import * as openaiAdapter from '../../lib/adapters/openai';
import { createTestRun, saveEvaluation, updateTestRunStatus } from '../../lib/supabase';

interface TestRequest {
  model: 'gpt-4' | 'claude-sonnet-4' | 'gemini-pro' | 'custom';
  scenarioIds?: string[]; // If empty, run all
  modelVersion?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { model, scenarioIds, modelVersion }: TestRequest = req.body;

  if (!model) {
    return res.status(400).json({ error: 'Model is required' });
  }

  try {
    // Load scenarios
    const scenariosResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/scenarios.json`);
    const scenariosData = await scenariosResponse.json();
    
    const scenarios = scenarioIds && scenarioIds.length > 0
      ? scenariosData.scenarios.filter(s => scenarioIds.includes(s.id))
      : scenariosData.scenarios;

    // Create test run
    const testRunId = await createTestRun(model, modelVersion);

    // Select adapter based on model
    const adapter = model.includes('claude') 
      ? anthropicAdapter  
      : null;

    if (!adapter) {
      throw new Error(`Unsupported model: ${model}`);
    }

    let totalScore = 0;
    let completedEvaluations = 0;

    // Run each scenario
    for (const scenario of scenarios) {
      const conversationHistory: any[] = [];

      for (const question of scenario.questions) {
        try {
          // Get AI response
          const messages = [
            ...conversationHistory,
            { role: 'user' as const, content: question.text }
          ];

          const { response: aiResponse, metadata } = await adapter.runScenario(messages);

          // Add to conversation history
          conversationHistory.push(
            { role: 'user' as const, content: question.text },
            { role: 'assistant' as const, content: aiResponse }
          );

          // Evaluate the response
          const evaluation = await anthropicAdapter.evaluateResponse(
            scenario.id,
            question.number,
            question.text,
            aiResponse,
            conversationHistory.slice(0, -2) // Previous history, not current exchange
          );

          const questionTotal = Object.values(evaluation.scores).reduce((a: number, b: number) => a + b, 0);
          totalScore += questionTotal;

          // Save evaluation
          await saveEvaluation({
            test_run_id: testRunId,
            scenario_id: scenario.id,
            question_number: question.number,
            question_text: question.text,
            ai_response: aiResponse,
            auto_contradiction_recognition: evaluation.scores.contradiction_recognition,
            auto_meta_cognitive_depth: evaluation.scores.meta_cognitive_depth,
            auto_uncertainty_tolerance: evaluation.scores.uncertainty_tolerance,
            auto_value_synthesis: evaluation.scores.value_synthesis,
            auto_self_awareness: evaluation.scores.self_awareness,
            auto_total: questionTotal,
            auto_confidence: evaluation.confidence,
            auto_justifications: evaluation.justifications,
            review_status: evaluation.confidence === 'low' ? 'pending' : 'accepted',
            // Initially, final scores = auto scores
            final_contradiction_recognition: evaluation.scores.contradiction_recognition,
            final_meta_cognitive_depth: evaluation.scores.meta_cognitive_depth,
            final_uncertainty_tolerance: evaluation.scores.uncertainty_tolerance,
            final_value_synthesis: evaluation.scores.value_synthesis,
            final_self_awareness: evaluation.scores.self_awareness,
            final_total: questionTotal,
          });

          completedEvaluations++;

          // Send progress update
          res.write(JSON.stringify({
            type: 'progress',
            completed: completedEvaluations,
            total: scenarios.length * 4,
            currentScenario: scenario.title,
            currentQuestion: question.number,
          }) + '\n');

        } catch (error) {
          console.error(`Error in scenario ${scenario.id}, question ${question.number}:`, error);
          // Continue with next question
        }
      }
    }

    // Update test run as completed
    await updateTestRunStatus(testRunId, 'completed', totalScore);

    return res.status(200).json({
      type: 'complete',
      testRunId,
      totalScore,
      maxScore: scenarios.length * 4 * 5 * 5, // scenarios * questions * dimensions * max_score
      completedEvaluations,
    });

  } catch (error) {
    console.error('Test run error:', error);
    return res.status(500).json({
      error: 'Test run failed',
      details: error.message,
    });
  }
}