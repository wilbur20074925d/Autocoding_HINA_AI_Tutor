import React, { useMemo, useState, useEffect } from 'react';
import { ArrowLeft, MessageSquare, BarChart3, TrendingUp, Target, Clock, Brain, AlertCircle, CheckCircle, BookOpen, FileText, Activity, Network, Layers, Download, Loader2, Sparkles } from 'lucide-react';
import Plot from 'react-plotly.js';
import { GeminiService } from '../../services/geminiService';
import jsPDF from 'jspdf';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  turnNumber?: number;
  detectedStage?: string;
  messageRole?: string;
}

interface ChatReportProps {
  messages: Message[];
  sessionTitle: string;
  sessionId: string | null;
  aiUsageSeconds: number;
  stagePercentages: {
    'Clarify': number;
    'Plan': number;
    'Execute': number;
    'Verify': number;
    'Reflect': number;
  };
  roleUsageCounts: {
    'analyst': number;
    'experimenter': number;
    'reviewer': number;
    'summarizer': number;
  };
  questionTree: Array<{id: string, question: string, timestamp: Date, role?: string, stage?: string}>;
  detectedErrors: Array<{
    type: string;
    description: string;
    count: number;
    severity: 'low' | 'medium' | 'high';
    timestamp: Date;
  }>;
  structuredEvidence: Array<{
    type: string;
    content: string;
    confidence: number;
    stage: string;
  }>;
  uncertaintyRecord: Array<{
    content: string;
    stage: string;
    confidence: number;
    timestamp: Date;
  }>;
  onBack: () => void;
}

const ChatReport: React.FC<ChatReportProps> = ({
  messages,
  sessionTitle,
  sessionId,
  aiUsageSeconds,
  stagePercentages,
  roleUsageCounts,
  questionTree,
  detectedErrors,
  structuredEvidence,
  uncertaintyRecord,
  onBack
}) => {
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<string | null>(null);
  const [aiMarkerAnalysis, setAiMarkerAnalysis] = useState<{
    overallScore: number;
    categoryScores: Record<string, number>;
    strengths: string[];
    weaknesses: string[];
    detailedAnalysis: string;
    recommendations: string[];
  } | null>(null);
  const [isGeneratingMarker, setIsGeneratingMarker] = useState(false);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const formatAIUsageTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  const totalMessages = messages.length;
  const userMessages = messages.filter(m => m.role === 'user').length;
  const assistantMessages = messages.filter(m => m.role === 'assistant').length;
  const totalDuration = messages.length > 0 
    ? Math.round((messages[messages.length - 1].timestamp.getTime() - messages[0].timestamp.getTime()) / (1000 * 60))
    : 0;

  const phases = [
    { id: 'Clarify', name: 'Clarify', color: '#3B82F6' },
    { id: 'Plan', name: 'Plan', color: '#A855F7' },
    { id: 'Execute', name: 'Execute', color: '#10B981' },
    { id: 'Verify', name: 'Verify', color: '#EAB308' },
    { id: 'Reflect', name: 'Reflect', color: '#6366F1' },
  ];

  const roleLabels = ['Analyst', 'Experimenter', 'Reviewer', 'Summarizer'];
  const roleValues = [
    roleUsageCounts.analyst,
    roleUsageCounts.experimenter,
    roleUsageCounts.reviewer,
    roleUsageCounts.summarizer
  ];
  const roleColors = ['#3B82F6', '#A855F7', '#10B981', '#F97316'];

  const stageLabels = phases.map(p => p.name);
  const stageValues = phases.map(p => stagePercentages[p.id as keyof typeof stagePercentages]);
  const stageColors = phases.map(p => p.color);

  // Advanced Plot 1: Message Timeline Analysis
  const messageTimelineData = useMemo(() => {
    if (messages.length === 0) return { times: [], counts: [], userCounts: [], assistantCounts: [] };
    
    const timeIntervals: { [key: string]: { total: number; user: number; assistant: number } } = {};
    const startTime = messages[0].timestamp.getTime();
    
    messages.forEach(msg => {
      const elapsed = Math.floor((msg.timestamp.getTime() - startTime) / 60000); // minutes
      const interval = Math.floor(elapsed / 2) * 2; // 2-minute intervals
      const key = `${interval}`;
      
      if (!timeIntervals[key]) {
        timeIntervals[key] = { total: 0, user: 0, assistant: 0 };
      }
      timeIntervals[key].total++;
      if (msg.role === 'user') timeIntervals[key].user++;
      else timeIntervals[key].assistant++;
    });
    
    const sortedKeys = Object.keys(timeIntervals).map(Number).sort((a, b) => a - b);
    return {
      times: sortedKeys,
      counts: sortedKeys.map(k => timeIntervals[String(k)].total),
      userCounts: sortedKeys.map(k => timeIntervals[String(k)].user),
      assistantCounts: sortedKeys.map(k => timeIntervals[String(k)].assistant)
    };
  }, [messages]);

  // Advanced Plot 2: Stage Transition Matrix
  const stageTransitionMatrix = useMemo(() => {
    const matrix: number[][] = Array(5).fill(0).map(() => Array(5).fill(0));
    const stageIndex: { [key: string]: number } = {
      'Clarify': 0, 'Plan': 1, 'Execute': 2, 'Verify': 3, 'Reflect': 4
    };
    
    const assistantMessages = messages.filter(m => m.role === 'assistant' && m.detectedStage);
    for (let i = 1; i < assistantMessages.length; i++) {
      const prevStage = assistantMessages[i - 1].detectedStage;
      const currStage = assistantMessages[i].detectedStage;
      if (prevStage && currStage && stageIndex[prevStage] !== undefined && stageIndex[currStage] !== undefined) {
        matrix[stageIndex[prevStage]][stageIndex[currStage]]++;
      }
    }
    
    return matrix;
  }, [messages]);

  // Advanced Plot 3: Message Length Distribution
  const messageLengthData = useMemo(() => {
    const userLengths = messages.filter(m => m.role === 'user').map(m => m.content.length);
    const assistantLengths = messages.filter(m => m.role === 'assistant').map(m => m.content.length);
    return { userLengths, assistantLengths };
  }, [messages]);

  // Advanced Plot 4: Stage Evolution Over Time
  const stageEvolutionData = useMemo(() => {
    const assistantMessages = messages.filter(m => m.role === 'assistant' && m.detectedStage);
    const startTime = messages.length > 0 ? messages[0].timestamp.getTime() : Date.now();
    
    const stageData: { [key: string]: { x: number[]; y: number[] } } = {
      'Clarify': { x: [], y: [] },
      'Plan': { x: [], y: [] },
      'Execute': { x: [], y: [] },
      'Verify': { x: [], y: [] },
      'Reflect': { x: [], y: [] }
    };
    
    assistantMessages.forEach((msg, idx) => {
      const elapsed = (msg.timestamp.getTime() - startTime) / 60000; // minutes
      const stage = msg.detectedStage;
      if (stage && stageData[stage]) {
        stageData[stage].x.push(elapsed);
        stageData[stage].y.push(idx);
      }
    });
    
    return stageData;
  }, [messages]);

  // Advanced Plot 5: Role-Stage Correlation
  const roleStageCorrelation = useMemo(() => {
    const correlation: { [key: string]: { [key: string]: number } } = {};
    const roles = ['analyst', 'experimenter', 'reviewer', 'summarizer'];
    const stages = ['Clarify', 'Plan', 'Execute', 'Verify', 'Reflect'];
    
    roles.forEach(role => {
      correlation[role] = {};
      stages.forEach(stage => {
        correlation[role][stage] = 0;
      });
    });
    
    messages.filter(m => m.role === 'assistant' && m.detectedStage && m.messageRole).forEach(msg => {
      const role = msg.messageRole!;
      const stage = msg.detectedStage!;
      if (correlation[role] && correlation[role][stage] !== undefined) {
        correlation[role][stage]++;
      }
    });
    
    return correlation;
  }, [messages]);

  // Advanced Plot 6: Error Timeline
  const errorTimelineData = useMemo(() => {
    if (detectedErrors.length === 0 || messages.length === 0) return [];
    const startTime = messages[0].timestamp.getTime();
    
    return detectedErrors.map(error => ({
      x: (error.timestamp.getTime() - startTime) / 60000,
      type: error.type,
      count: error.count,
      severity: error.severity
    }));
  }, [detectedErrors, messages]);

  // Advanced Plot 7: Uncertainty Confidence Distribution
  const uncertaintyData = useMemo(() => {
    const confidences = uncertaintyRecord.map(u => u.confidence * 100);
    const stages = uncertaintyRecord.map(u => u.stage);
    return { confidences, stages };
  }, [uncertaintyRecord]);

  // Advanced Plot 8: Conversation Flow Network
  const conversationFlowData = useMemo(() => {
    const nodes: Array<{ id: string; label: string; group: number; size: number }> = [];
    const links: Array<{ source: number; target: number; value: number }> = [];
    
    // Create nodes for each message
    messages.forEach((msg, idx) => {
      nodes.push({
        id: `msg-${idx}`,
        label: msg.role === 'user' ? 'User' : `AI-${msg.detectedStage || 'Unknown'}`,
        group: msg.role === 'user' ? 0 : (msg.detectedStage ? ['Clarify', 'Plan', 'Execute', 'Verify', 'Reflect'].indexOf(msg.detectedStage) + 1 : 6),
        size: Math.min(Math.max(msg.content.length / 20, 5), 30)
      });
      
      if (idx > 0) {
        links.push({
          source: idx - 1,
          target: idx,
          value: 1
        });
      }
    });
    
    return { nodes, links };
  }, [messages]);

  // Advanced Plot 9: Response Time Analysis
  const responseTimeData = useMemo(() => {
    const responseTimes: number[] = [];
    for (let i = 1; i < messages.length; i++) {
      if (messages[i - 1].role === 'user' && messages[i].role === 'assistant') {
        const timeDiff = (messages[i].timestamp.getTime() - messages[i - 1].timestamp.getTime()) / 1000; // seconds
        responseTimes.push(timeDiff);
      }
    }
    return responseTimes;
  }, [messages]);

  // Advanced Plot 10: 3D Scatter Plot - Message Position, Time, and Length
  const threeDScatterData = useMemo(() => {
    if (messages.length === 0) return { x: [], y: [], z: [], colors: [], text: [] };
    const startTime = messages[0].timestamp.getTime();
    
    const data = messages.map((msg, idx) => ({
      x: idx, // Message index
      y: (msg.timestamp.getTime() - startTime) / 60000, // Time in minutes
      z: msg.content.length, // Message length
      color: msg.role === 'user' ? 'blue' : 
             msg.detectedStage === 'Clarify' ? '#3B82F6' :
             msg.detectedStage === 'Plan' ? '#A855F7' :
             msg.detectedStage === 'Execute' ? '#10B981' :
             msg.detectedStage === 'Verify' ? '#EAB308' :
             msg.detectedStage === 'Reflect' ? '#6366F1' : '#9CA3AF',
      text: `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.content.substring(0, 50)}...`,
      stage: msg.detectedStage || 'Unknown'
    }));
    
    return {
      x: data.map(d => d.x),
      y: data.map(d => d.y),
      z: data.map(d => d.z),
      colors: data.map(d => d.color),
      text: data.map(d => d.text),
      stages: data.map(d => d.stage)
    };
  }, [messages]);

  // Advanced Plot 11: Parallel Coordinates Plot - Multi-dimensional Analysis
  const parallelCoordinatesData = useMemo(() => {
    if (messages.length === 0) return [];
    const startTime = messages[0].timestamp.getTime();
    
    return messages.map((msg, idx) => {
      const timeElapsed = (msg.timestamp.getTime() - startTime) / 60000;
      const stageIndex = msg.detectedStage ? 
        ['Clarify', 'Plan', 'Execute', 'Verify', 'Reflect'].indexOf(msg.detectedStage) : -1;
      const roleIndex = msg.messageRole ?
        ['analyst', 'experimenter', 'reviewer', 'summarizer'].indexOf(msg.messageRole) : -1;
      
      return {
        'Message Index': idx,
        'Time (min)': Math.round(timeElapsed * 10) / 10,
        'Length (chars)': msg.content.length,
        'Stage Index': stageIndex >= 0 ? stageIndex : 0,
        'Role Index': roleIndex >= 0 ? roleIndex : 0,
        'Word Count': msg.content.split(/\s+/).length,
        'Has Questions': msg.content.includes('?') ? 1 : 0,
        'Turn Number': msg.turnNumber || Math.floor(idx / 2) + 1
      };
    });
  }, [messages]);

  // Advanced Plot 12: Ternary Plot - Balance Between Stages
  const ternaryData = useMemo(() => {
    if (messages.length === 0) return { a: [], b: [], c: [], time: [], colors: [] };
    
    const assistantMessages = messages.filter(m => m.role === 'assistant' && m.detectedStage);
    
    // If no assistant messages with detected stages, calculate from overall stage percentages
    if (assistantMessages.length === 0) {
      // Use stage percentages as single data point
      const clarify = stagePercentages.Clarify || 0;
      const planExecute = (stagePercentages.Plan || 0) + (stagePercentages.Execute || 0);
      const verifyReflect = (stagePercentages.Verify || 0) + (stagePercentages.Reflect || 0);
      
      // Normalize to ensure sum is 100
      const total = clarify + planExecute + verifyReflect;
      if (total > 0) {
        return {
          a: [clarify],
          b: [planExecute],
          c: [verifyReflect],
          time: [0],
          colors: [
            clarify > planExecute && clarify > verifyReflect ? '#3B82F6' :
            planExecute > verifyReflect ? '#10B981' : '#6366F1'
          ]
        };
      }
      return { a: [], b: [], c: [], time: [], colors: [] };
    }
    
    const startTime = messages[0].timestamp.getTime();
    
    // Group messages into time windows and calculate stage proportions
    // Use smaller windows for better granularity, but ensure at least 1 window
    const targetWindows = Math.min(10, Math.max(3, assistantMessages.length));
    const windowSize = Math.max(1, Math.floor(assistantMessages.length / targetWindows));
    
    const windows: Array<{
      a: number; // Clarify
      b: number; // Plan + Execute
      c: number; // Verify + Reflect
      time: number;
    }> = [];
    
    // Process in sliding windows for smoother transitions if we have enough data
    if (assistantMessages.length >= windowSize) {
      for (let i = 0; i <= assistantMessages.length - windowSize; i += Math.max(1, Math.floor(windowSize / 2))) {
      const window = assistantMessages.slice(i, i + windowSize);
      const clarify = window.filter(m => m.detectedStage === 'Clarify').length;
      const planExecute = window.filter(m => m.detectedStage === 'Plan' || m.detectedStage === 'Execute').length;
      const verifyReflect = window.filter(m => m.detectedStage === 'Verify' || m.detectedStage === 'Reflect').length;
      const total = window.length;
      
      if (total > 0) {
        const elapsed = (window[0].timestamp.getTime() - startTime) / 60000;
          windows.push({
            a: (clarify / total) * 100,
            b: (planExecute / total) * 100,
            c: (verifyReflect / total) * 100,
            time: elapsed
          });
        }
      }
    } else {
      // For very few messages, use all messages as single window
      const clarify = assistantMessages.filter(m => m.detectedStage === 'Clarify').length;
      const planExecute = assistantMessages.filter(m => m.detectedStage === 'Plan' || m.detectedStage === 'Execute').length;
      const verifyReflect = assistantMessages.filter(m => m.detectedStage === 'Verify' || m.detectedStage === 'Reflect').length;
      const total = assistantMessages.length;
      
      if (total > 0) {
        const elapsed = (assistantMessages[0].timestamp.getTime() - startTime) / 60000;
        windows.push({
          a: (clarify / total) * 100,
          b: (planExecute / total) * 100,
          c: (verifyReflect / total) * 100,
          time: elapsed
        });
      }
    }
    
    // Ensure we have at least one data point
    if (windows.length === 0 && assistantMessages.length > 0) {
      const clarify = assistantMessages.filter(m => m.detectedStage === 'Clarify').length;
      const planExecute = assistantMessages.filter(m => m.detectedStage === 'Plan' || m.detectedStage === 'Execute').length;
      const verifyReflect = assistantMessages.filter(m => m.detectedStage === 'Verify' || m.detectedStage === 'Reflect').length;
      const total = assistantMessages.length;
      
      if (total > 0) {
        const elapsed = (assistantMessages[0].timestamp.getTime() - startTime) / 60000;
        windows.push({
          a: (clarify / total) * 100,
          b: (planExecute / total) * 100,
          c: (verifyReflect / total) * 100,
          time: elapsed
        });
      }
    }
    
    return {
      a: windows.map(w => w.a),
      b: windows.map(w => w.b),
      c: windows.map(w => w.c),
      time: windows.map(w => w.time),
      colors: windows.map(w => {
        // Color based on dominant stage
        if (w.a > w.b && w.a > w.c) return '#3B82F6'; // Clarify dominant
        if (w.b > w.c) return '#10B981'; // Plan/Execute dominant
        return '#6366F1'; // Verify/Reflect dominant
      })
    };
  }, [messages, stagePercentages]);

  // Analyze sentiment of conversation
  const analyzeSentiment = async (): Promise<{
    overall: string;
    userSentiment: string;
    assistantSentiment: string;
    emotionalTone: string[];
  }> => {
    try {
      const userMessagesText = messages
        .filter(m => m.role === 'user')
        .map(m => m.content)
        .join('\n');
      const assistantMessagesText = messages
        .filter(m => m.role === 'assistant')
        .map(m => m.content)
        .join('\n');

      const sentimentPrompt = `Analyze the sentiment of this conversation. Provide a JSON response with:
{
  "overall": "positive/neutral/negative",
  "userSentiment": "brief description of user's emotional tone",
  "assistantSentiment": "brief description of assistant's emotional tone",
  "emotionalTone": ["list", "of", "key", "emotions", "detected"]
}

User Messages:
${userMessagesText.substring(0, 2000)}

Assistant Messages:
${assistantMessagesText.substring(0, 2000)}`;

      const response = await GeminiService.generateContent(sentimentPrompt);
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Error analyzing sentiment:', error);
    }
    
    // Fallback
    return {
      overall: 'neutral',
      userSentiment: 'Engaged and interactive',
      assistantSentiment: 'Helpful and supportive',
      emotionalTone: ['engaged', 'collaborative']
    };
  };

  // Generate academic report using Gemini
  const generateAcademicReport = async () => {
    setIsGeneratingReport(true);
    try {
      // Get sentiment analysis
      const sentiment = await analyzeSentiment();

      // Prepare conversation summary
      const conversationSummary = messages
        .slice(0, 20)
        .map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content.substring(0, 200)}`)
        .join('\n\n');

      // Prepare statistics
      const avgMessageLength = messages.length > 0
        ? Math.round(messages.reduce((sum, m) => sum + m.content.length, 0) / messages.length)
        : 0;
      
      const stageDistribution = Object.entries(stagePercentages)
        .map(([stage, pct]) => `${stage}: ${pct}%`)
        .join(', ');

      const reportPrompt = `Generate an academic report in LaTeX format analyzing a student's AI tutoring session. The report should be approximately 500 words and include:

REQUIREMENTS:
- Use LaTeX document format with \\documentclass{article}
- Include proper headers, sections, subsections
- Academic writing style
- Around 500 words total
- Include tables and formatted statistics

DATA PROVIDED:
Session Title: ${sessionTitle}
Total Messages: ${totalMessages}
User Messages: ${userMessages}
AI Responses: ${assistantMessages}
Total Duration: ${totalDuration} minutes
AI Usage Time: ${formatAIUsageTime(aiUsageSeconds)}
Average Message Length: ${avgMessageLength} characters
Sentiment Analysis:
- Overall: ${sentiment.overall}
- User Sentiment: ${sentiment.userSentiment}
- Assistant Sentiment: ${sentiment.assistantSentiment}
- Emotional Tone: ${sentiment.emotionalTone.join(', ')}

Stage Distribution:
${stageDistribution}

Role Usage:
Analyst: ${roleUsageCounts.analyst}, Experimenter: ${roleUsageCounts.experimenter}, Reviewer: ${roleUsageCounts.reviewer}, Summarizer: ${roleUsageCounts.summarizer}

Questions Asked: ${questionTree.length}
Errors Detected: ${detectedErrors.length}
Structured Evidence: ${structuredEvidence.length}

Sample Conversation:
${conversationSummary}

Generate a comprehensive academic report with the following sections:
1. Executive Summary (brief overview)
2. Methodology (how the analysis was conducted)
3. Session Overview (statistics and key metrics)
4. Sentiment and Engagement Analysis
5. Cognitive Stage Distribution
6. AI Role Utilization
7. Learning Outcomes and Evidence
8. Conclusions and Recommendations

Make it professional and academic. Use proper LaTeX formatting with tables, sections, and citations if appropriate.`;

      const latexReport = await GeminiService.generateContent(reportPrompt);
      setGeneratedReport(latexReport);
      return latexReport;
    } catch (error) {
      console.error('Error generating report:', error);
      alert('Failed to generate report. Please try again.');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // Auto-generate report and AI marker on component mount
  useEffect(() => {
    if (messages.length > 0 && !generatedReport && !isGeneratingReport) {
      generateAcademicReport();
    }
    if (messages.length > 0 && !aiMarkerAnalysis && !isGeneratingMarker) {
      generateAIMarkerAnalysis();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // Download PDF from LaTeX report
  const downloadPDF = async () => {
    let reportText = generatedReport;
    
    if (!reportText) {
      // Generate report first
      reportText = await generateAcademicReport();
      if (!reportText) {
        alert('Failed to generate report');
        return;
      }
    }

    try {
      // Extract LaTeX content (remove document class and begin/end document if present)
      let content = reportText;
      
      // Remove LaTeX document structure if present
      content = content.replace(/\\documentclass\{[^}]+\}/g, '');
      content = content.replace(/\\begin\{document\}/g, '');
      content = content.replace(/\\end\{document\}/g, '');
      
      // Convert LaTeX to plain text for PDF (improved conversion)
      // Process in order to preserve nested structures
      content = content
        // Remove document structure first
        .replace(/\\maketitle/g, '')
        // Handle sections and subsections
        .replace(/\\section\{([^}]+)\}/g, '\n\n$1\n' + '='.repeat(50) + '\n')
        .replace(/\\subsection\{([^}]+)\}/g, '\n\n$1\n' + '-'.repeat(40) + '\n')
        .replace(/\\subsubsection\{([^}]+)\}/g, '\n\n$1\n' + '-'.repeat(30) + '\n')
        // Handle text formatting (extract content from braces)
        .replace(/\\textbf\{([^}]+)\}/g, '$1')
        .replace(/\\textit\{([^}]+)\}/g, '$1')
        .replace(/\\emph\{([^}]+)\}/g, '$1')
        .replace(/\\text\{([^}]+)\}/g, '$1')
        // Handle lists
        .replace(/\\begin\{itemize\}/g, '')
        .replace(/\\end\{itemize\}/g, '')
        .replace(/\\begin\{enumerate\}/g, '')
        .replace(/\\end\{enumerate\}/g, '')
        .replace(/\\item\s+/g, '• ')
        // Handle tables (simplify)
        .replace(/\\begin\{tabular\}[^]*?\\end\{tabular\}/gs, '[Table]')
        // Handle line breaks
        .replace(/\\\\/g, '\n')
        .replace(/\\\\\[.*?\]/g, '\n')
        .replace(/\\\\\(.*?\)/g, '\n')
        // Remove citations and references
        .replace(/\\cite\{[^}]+\}/g, '')
        .replace(/\\ref\{[^}]+\}/g, '')
        .replace(/\\label\{[^}]+\}/g, '')
        .replace(/\\href\{[^}]+\}\{([^}]+)\}/g, '$1')
        // Handle remaining LaTeX commands (more conservative)
        .replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?(\{[^}]*\})?/g, (match) => {
          // Try to extract content from braces
          const braceMatch = match.match(/\{([^}]+)\}/);
          return braceMatch ? braceMatch[1] : '';
        })
        // Clean up multiple newlines
        .replace(/\n{3,}/g, '\n\n')
        // Clean up trailing LaTeX backslashes
        .replace(/\\+$/gm, '')
        .trim();

      // Create PDF
      const pdf = new jsPDF();
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 20;
      const maxWidth = pageWidth - 2 * margin;

      // Add title
      pdf.setFontSize(18);
      pdf.setFont(undefined, 'bold');
      pdf.text('Academic Session Report', margin, 30);
      
      pdf.setFontSize(12);
      pdf.setFont(undefined, 'normal');
      pdf.text(sessionTitle, margin, 40);
      pdf.text(`Generated on: ${formatDate(new Date())}`, margin, 50);

      // Add content
      const lines = pdf.splitTextToSize(content, maxWidth);
      let y = 65;
      const lineHeight = 7;

      pdf.setFontSize(10);
      
      for (const line of lines) {
        if (y > pageHeight - margin) {
          pdf.addPage();
          y = margin;
        }
        pdf.text(line, margin, y);
        y += lineHeight;
      }

      // Save PDF
      const fileName = `Chat_Report_${sessionTitle.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.pdf`;
      pdf.save(fileName);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    }
  };

  // Convert LaTeX to HTML for display
  const convertLaTeXToHTML = (latexText: string): string => {
    let html = latexText;
    
    // Remove document structure
    html = html.replace(/\\documentclass\{[^}]+\}/g, '');
    html = html.replace(/\\usepackage\{[^}]+\}/g, '');
    html = html.replace(/\\geometry\{[^}]+\}/g, '');
    html = html.replace(/\\title\{[^}]+\}/g, '');
    html = html.replace(/\\author\{[^}]+\}/g, '');
    html = html.replace(/\\date\{[^}]+\}/g, '');
    html = html.replace(/\\begin\{document\}/g, '');
    html = html.replace(/\\end\{document\}/g, '');
    html = html.replace(/\\maketitle/g, '');
    
    // Convert tables first (before other processing)
    html = html.replace(/\\begin\{table\}(\[[^\]]*\])?([\s\S]*?)\\end\{table\}/g, (match, placement, content) => {
      // Extract caption if present
      let caption = '';
      content = content.replace(/\\caption\{([^}]+)\}/g, (_, cap) => {
        caption = cap;
        return '';
      });
      
      // Remove centering command
      content = content.replace(/\\centering/g, '');
      
      // Extract tabular content - handle both wrapped and unwrapped cases
      let tableContent = '';
      const tabularMatch = content.match(/\\begin\{tabular\}\{([^}]+)\}([\s\S]*?)\\end\{tabular\}/);
      if (tabularMatch) {
        tableContent = tabularMatch[2];
      } else {
        // Try to find table content directly
        tableContent = content.trim();
      }
      
      if (!tableContent) return '[Table content]';
      
      // Remove LaTeX table formatting commands (keep for detection but remove from content)
      const hasHeader = tableContent.includes('\\toprule') || tableContent.includes('\\midrule');
      tableContent = tableContent.replace(/\\toprule/g, '');
      tableContent = tableContent.replace(/\\midrule/g, '');
      tableContent = tableContent.replace(/\\bottomrule/g, '');
      tableContent = tableContent.replace(/\\hline/g, '');
      
      // Parse rows - split by \\ (row separator), \n\n, or just \n if it contains &
      let rows = tableContent.split(/\\\\/).filter(row => row.trim());
      
      // If no rows found, try splitting by newlines
      if (rows.length === 0 || rows.every(r => !r.includes('&'))) {
        rows = tableContent.split(/\n/).filter(row => {
          const trimmed = row.trim();
          return trimmed.length > 0 && trimmed.includes('&');
        });
      }
      
      // Filter rows to only include those with actual table data
      rows = rows.filter(row => {
        const cleaned = row.trim();
        return cleaned.length > 0 && cleaned.includes('&');
      });
      
      if (rows.length === 0) return '[Table content]';
      
      let tableHTML = '<div class="overflow-x-auto my-6"><table class="min-w-full border-collapse border border-gray-300 shadow-sm">';
      
      if (caption) {
        tableHTML += `<caption class="font-semibold text-gray-800 mb-3 text-lg">${caption}</caption>`;
      }
      
      rows.forEach((row, index) => {
        // Clean up the row
        row = row.trim();
        
        // Split by & to get cells (simple split since LaTeX typically doesn't escape &)
        const cells = row.split('&').map(cell => {
          // Remove LaTeX commands but keep text
          return cell.trim()
            .replace(/\\textbf\{([^}]+)\}/g, '$1')
            .replace(/\\textit\{([^}]+)\}/g, '$1')
            .replace(/\\emph\{([^}]+)\}/g, '$1')
            .replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?\{([^}]*)\}/g, '$2')
            .replace(/\\/g, '')
            .trim();
        });
        
        // Skip if no valid cells
        if (cells.length === 0 || cells.every(c => !c)) return;
        
        // First row is typically header (or if hasHeader flag was set)
        const isHeader = (index === 0 && hasHeader) || (index === 0 && rows.length > 1);
        
        tableHTML += '<tr class="' + (isHeader ? 'bg-gray-100 font-semibold' : 'bg-white hover:bg-gray-50') + '">';
        cells.forEach(cell => {
          const tag = isHeader ? 'th' : 'td';
          const cellContent = cell || ' ';
          tableHTML += `<${tag} class="border border-gray-300 px-4 py-2 text-left ${isHeader ? 'text-gray-800' : 'text-gray-700'}">${cellContent}</${tag}>`;
        });
        tableHTML += '</tr>';
      });
      
      tableHTML += '</table></div>';
      return tableHTML;
    });
    
    // Convert sections to HTML headings (do this before other replacements)
    html = html.replace(/\\section\{([^}]+)\}/g, '<h2 class="text-2xl font-bold mt-6 mb-4 text-gray-900 border-b border-gray-200 pb-2">$1</h2>');
    html = html.replace(/\\subsection\{([^}]+)\}/g, '<h3 class="text-xl font-semibold mt-5 mb-3 text-gray-800">$1</h3>');
    html = html.replace(/\\subsubsection\{([^}]+)\}/g, '<h4 class="text-lg font-medium mt-4 mb-2 text-gray-700">$1</h4>');
    
    // Convert text formatting (process nested formatting)
    html = html.replace(/\\textbf\{([^}]+)\}/g, '<strong>$1</strong>');
    html = html.replace(/\\textit\{([^}]+)\}/g, '<em>$1</em>');
    html = html.replace(/\\emph\{([^}]+)\}/g, '<em>$1</em>');
    
    // Convert lists - handle itemize
    html = html.replace(/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g, (match, content) => {
      const items = content.split(/\\item\s+/).filter((item: string) => item.trim());
      const listItems = items.map((item: string) => 
        `<li class="ml-6 mb-2">${item.trim().replace(/\\/g, '')}</li>`
      ).join('');
      return `<ul class="list-disc my-4 space-y-2">${listItems}</ul>`;
    });
    
    // Convert lists - handle enumerate
    html = html.replace(/\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/g, (match, content) => {
      const items = content.split(/\\item\s+/).filter((item: string) => item.trim());
      const listItems = items.map((item: string) => 
        `<li class="ml-6 mb-2">${item.trim().replace(/\\/g, '')}</li>`
      ).join('');
      return `<ol class="list-decimal my-4 space-y-2">${listItems}</ol>`;
    });
    
    // Handle standalone items (fallback)
    html = html.replace(/\\item\s+([^\n]+)/g, '<li class="ml-6 mb-2">$1</li>');
    
    // Clean up LaTeX commands
    html = html.replace(/\\cite\{[^}]+\}/g, '');
    html = html.replace(/\\ref\{[^}]+\}/g, '');
    html = html.replace(/\\label\{[^}]+\}/g, '');
    html = html.replace(/\\href\{[^}]+\}\{([^}]+)\}/g, '<a href="#" class="text-blue-600 hover:underline">$1</a>');
    
    // Handle line breaks
    html = html.replace(/\\\\/g, '<br />');
    
    // Convert paragraphs - split by double newlines but preserve single newlines within paragraphs
    const paragraphs = html.split(/\n\n+/);
    html = paragraphs.map((para) => {
      para = para.trim();
      if (!para || para.startsWith('<h') || para.startsWith('<ul') || para.startsWith('<ol')) {
        return para;
      }
      // Replace single newlines with spaces within paragraphs
      para = para.replace(/\n/g, ' ');
      return `<p class="mb-4 text-gray-700 leading-relaxed">${para}</p>`;
    }).join('\n');
    
    // Clean up multiple <br /> tags
    html = html.replace(/(<br\s*\/?>){3,}/g, '<br /><br />');
    
    // Remove remaining LaTeX commands (conservative approach - extract content from braces)
    html = html.replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?\{([^}]*)\}/g, '$2');
    
    // Final cleanup - remove any remaining backslashes
    html = html.replace(/\\/g, '');
    
    // Clean up empty paragraphs
    html = html.replace(/<p class="mb-4 text-gray-700 leading-relaxed">\s*<\/p>/g, '');
    
    return html;
  };

  // Generate AI Marker Analysis
  const generateAIMarkerAnalysis = async () => {
    setIsGeneratingMarker(true);
    try {
      // Prepare conversation data for analysis
      const userMessagesText = messages
        .filter(m => m.role === 'user')
        .map(m => m.content)
        .join('\n\n');
      
      const conversationContext = messages
        .slice(0, 30)
        .map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content.substring(0, 300)}`)
        .join('\n\n');

      const markerPrompt = `You are an AI marker analyzing a student's conversation with an AI tutoring system. Perform comprehensive analysis and provide scores.

CONVERSATION DATA:
${conversationContext}

STATISTICS:
- Total Messages: ${totalMessages}
- User Messages: ${userMessages}
- AI Responses: ${assistantMessages}
- Average Message Length: ${messages.length > 0 ? Math.round(messages.reduce((sum, m) => sum + m.content.length, 0) / messages.length) : 0} characters
- Stage Distribution: ${Object.entries(stagePercentages).map(([s, p]) => `${s}: ${p}%`).join(', ')}
- Questions Asked: ${questionTree.length}
- Errors Detected: ${detectedErrors.length}

PERFORM COMPREHENSIVE ANALYSIS:

1. Sentiment Analysis: Analyze the emotional tone, engagement level, and interaction quality
2. Communication Skills: Evaluate clarity, specificity, and effectiveness of questions
3. Problem-Solving Approach: Assess critical thinking, systematic approach, and learning strategy
4. Engagement Level: Evaluate participation, follow-through, and active learning
5. AI Collaboration: Assess how effectively the student uses AI assistance for learning

PROVIDE YOUR ANALYSIS IN THIS EXACT JSON FORMAT (respond ONLY with valid JSON):
{
  "overallScore": <integer 0-100, overall performance score>,
  "categoryScores": {
    "sentiment": <integer 0-100, sentiment and emotional engagement score>,
    "communication": <integer 0-100, communication skills score>,
    "problemSolving": <integer 0-100, problem-solving approach score>,
    "engagement": <integer 0-100, engagement level score>,
    "collaboration": <integer 0-100, AI collaboration effectiveness score>
  },
  "strengths": [
    "<specific strength 1>",
    "<specific strength 2>",
    "<specific strength 3>",
    "<specific strength 4>"
  ],
  "weaknesses": [
    "<specific weakness 1 (constructive feedback)>",
    "<specific weakness 2 (constructive feedback)>",
    "<specific weakness 3 (constructive feedback)>",
    "<specific weakness 4 (constructive feedback)>"
  ],
  "detailedAnalysis": "<2-3 paragraphs of detailed analysis covering sentiment, communication, problem-solving, engagement, and collaboration. Write in English>",
  "recommendations": [
    "<specific recommendation 1 (in English)>",
    "<specific recommendation 2 (in English)>",
    "<specific recommendation 3 (in English)>",
    "<specific recommendation 4 (in English)>"
  ]
}

SCORING GUIDELINES:
- Be fair and constructive
- Consider effort, progress, and learning mindset
- Most students should score 50-80
- Only award 80+ for exceptional performance
- Only award below 50 for very poor engagement or negative behavior

Make scores realistic and provide constructive feedback.`;

      const response = await GeminiService.generateContent(markerPrompt);
      
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0]);
        setAiMarkerAnalysis(analysis);
      } else {
        throw new Error('Invalid response format from AI');
      }
    } catch (error) {
      console.error('Error generating AI Marker analysis:', error);
      // Fallback analysis
      setAiMarkerAnalysis({
        overallScore: 65,
        categoryScores: {
          sentiment: 70,
          communication: 65,
          problemSolving: 60,
          engagement: 70,
          collaboration: 65
        },
        strengths: ['Actively engaged in conversation', 'Able to ask specific questions', 'Shows learning willingness'],
        weaknesses: ['Could explore problems more deeply', 'Could organize thoughts more systematically'],
        detailedAnalysis: 'Analysis generation encountered an issue. Please try again later.',
        recommendations: ['Continue active participation in conversations', 'Try to organize thoughts more systematically']
      });
    } finally {
      setIsGeneratingMarker(false);
    }
  };

  // Download LaTeX source
  const downloadLaTeX = async () => {
    let reportText = generatedReport;
    
    if (!reportText) {
      reportText = await generateAcademicReport();
      if (!reportText) {
        alert('Failed to generate report');
        return;
      }
    }

    try {
      // Ensure it has proper LaTeX structure
      let latexContent = reportText;
      
      if (!latexContent.includes('\\documentclass')) {
        latexContent = `\\documentclass[11pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{geometry}
\\usepackage{graphicx}
\\usepackage{booktabs}
\\usepackage{hyperref}
\\geometry{margin=1in}

\\title{Academic Session Report}
\\author{AI Tutoring System}
\\date{\\today}

\\begin{document}
\\maketitle

${latexContent}

\\end{document}`;
      }

      // Download as .tex file
      const blob = new Blob([latexContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Chat_Report_${sessionTitle.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.tex`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading LaTeX:', error);
      alert('Failed to download LaTeX file. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={onBack}
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Chat</span>
          </button>
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 mb-2">
              Chatting Report
            </h1>
            <p className="text-gray-600">{sessionTitle}</p>
            <div className="flex items-center space-x-4 mt-4 text-sm text-gray-500">
              <div className="flex items-center space-x-1">
                <Clock className="h-4 w-4" />
                <span>Generated on {formatDate(new Date())}</span>
              </div>
              {sessionId && (
                <div className="flex items-center space-x-1">
                  <FileText className="h-4 w-4" />
                  <span>Session ID: {sessionId.substring(0, 8)}...</span>
                </div>
              )}
                </div>
              </div>
              <div className="flex items-center space-x-2 ml-4">
                <button
                  onClick={downloadPDF}
                  disabled={isGeneratingReport}
                  className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Download Academic Report as PDF"
                >
                  {isGeneratingReport ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>Generating...</span>
                    </>
                  ) : (
                    <>
                      <Download className="h-5 w-5" />
                      <span>Download PDF</span>
                    </>
                  )}
                </button>
                {generatedReport && (
                  <button
                    onClick={downloadLaTeX}
                    className="flex items-center space-x-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg shadow-sm hover:bg-gray-200 transition-all duration-200"
                    title="Download LaTeX Source"
                  >
                    <FileText className="h-5 w-5" />
                    <span className="hidden sm:inline">LaTeX</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-md p-4 border border-gray-200">
            <div className="flex items-center space-x-2 mb-2">
              <MessageSquare className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-medium text-gray-600">Total Messages</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{totalMessages}</p>
          </div>
          <div className="bg-white rounded-xl shadow-md p-4 border border-gray-200">
            <div className="flex items-center space-x-2 mb-2">
              <Target className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium text-gray-600">User Messages</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{userMessages}</p>
          </div>
          <div className="bg-white rounded-xl shadow-md p-4 border border-gray-200">
            <div className="flex items-center space-x-2 mb-2">
              <Brain className="h-5 w-5 text-purple-600" />
              <span className="text-sm font-medium text-gray-600">AI Responses</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{assistantMessages}</p>
          </div>
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl shadow-md p-4 border border-blue-200">
            <div className="flex items-center space-x-2 mb-2">
              <Clock className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-medium text-blue-700">AI Usage Time</span>
            </div>
            <div className="bg-white rounded-md px-3 py-2 border border-blue-200 shadow-sm">
              <p className="text-2xl font-mono font-bold text-blue-600 tabular-nums">
                {formatAIUsageTime(aiUsageSeconds)}
              </p>
            </div>
          </div>
        </div>

        {/* Academic Report Display */}
        {generatedReport && (
          <div className="mb-6 bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-gray-900 flex items-center space-x-2">
                <FileText className="h-6 w-6 text-indigo-600" />
                <span>Academic Report</span>
              </h2>
              <div className="flex items-center space-x-2">
                <button
                  onClick={downloadPDF}
                  className="flex items-center space-x-2 px-3 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg shadow-sm hover:shadow-md transition-all duration-200 text-sm"
                  title="Download PDF"
                >
                  <Download className="h-4 w-4" />
                  <span>PDF</span>
                </button>
                <button
                  onClick={downloadLaTeX}
                  className="flex items-center space-x-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg shadow-sm hover:bg-gray-200 transition-all duration-200 text-sm"
                  title="Download LaTeX"
                >
                  <FileText className="h-4 w-4" />
                  <span>LaTeX</span>
                </button>
              </div>
            </div>
            <div className="prose prose-sm max-w-none bg-gray-50 rounded-lg p-6 border border-gray-200 overflow-auto max-h-[600px]">
              <div 
                className="text-gray-800 whitespace-pre-wrap font-serif leading-relaxed"
                dangerouslySetInnerHTML={{ __html: convertLaTeXToHTML(generatedReport) }}
              />
            </div>
          </div>
        )}

        {/* Loading indicator while generating report */}
        {isGeneratingReport && (
          <div className="mb-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl shadow-md p-6 border border-blue-200">
            <div className="flex items-center justify-center space-x-3">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
              <span className="text-gray-700 font-medium">Generating academic report...</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Cognitive Journey Map */}
          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center space-x-2">
              <BarChart3 className="h-5 w-5 text-indigo-600" />
              <span>Cognitive Journey Map</span>
            </h2>
            <Plot
              data={[{
                type: 'scatterpolar',
                r: [...stageValues, stageValues[0]],
                theta: [...stageLabels, stageLabels[0]],
                fill: 'toself',
                fillcolor: 'rgba(99, 102, 241, 0.2)',
                line: { color: '#6366F1', width: 2 },
                marker: { color: '#6366F1', size: 8 },
                hovertemplate: '<b>%{theta}</b><br>%{r}%<extra></extra>',
              }] as any}
              layout={{
                polar: {
                  bgcolor: 'rgba(255,255,255,0.0)',
                  radialaxis: {
                    gridcolor: '#E5E7EB',
                    linecolor: '#E5E7EB',
                    tickfont: { size: 10 },
                    range: [0, 100]
                  },
                  angularaxis: {
                    gridcolor: '#E5E7EB',
                    linecolor: '#E5E7EB',
                    tickfont: { size: 10 }
                  }
                },
                height: 350,
                margin: { l: 50, r: 50, t: 30, b: 30 },
                paper_bgcolor: 'rgba(0,0,0,0)',
                plot_bgcolor: 'rgba(0,0,0,0)',
                font: { size: 11, family: 'Inter, system-ui, sans-serif' }
              }}
              config={{ displayModeBar: false, responsive: true }}
              style={{ width: '100%', height: '100%' }}
            />
            <div className="mt-4 space-y-2">
              {phases.map((phase) => {
                const percentage = stagePercentages[phase.id as keyof typeof stagePercentages];
                return (
                  <div key={phase.id} className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: phase.color }} />
                      <span className="text-sm text-gray-700">{phase.name}</span>
                    </div>
                    <span className="text-sm font-semibold text-gray-900">{percentage}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Role Usage */}
          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center space-x-2">
              <Brain className="h-5 w-5 text-blue-600" />
              <span>Role Usage Analysis</span>
            </h2>
            <Plot
              data={[{
                type: 'pie',
                values: roleValues,
                labels: roleLabels,
                marker: {
                  colors: roleColors,
                  line: { color: '#fff', width: 2 }
                },
                textinfo: 'label+percent',
                textposition: 'outside',
                hole: 0.5,
                hoverinfo: 'label+value+percent',
                hovertemplate: '<b>%{label}</b><br>Count: %{value}<br>%{percent}<extra></extra>',
              }] as any}
              layout={{
                showlegend: true,
                height: 350,
                margin: { l: 20, r: 20, t: 30, b: 20 },
                paper_bgcolor: 'rgba(0,0,0,0)',
                plot_bgcolor: 'rgba(0,0,0,0)',
                font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                legend: { font: { size: 10 }, orientation: 'h', x: 0.5, y: -0.05, xanchor: 'center' }
              }}
              config={{ displayModeBar: false, responsive: true }}
              style={{ width: '100%', height: '100%' }}
            />
          </div>

          {/* Questions Asked */}
          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center space-x-2">
              <BookOpen className="h-5 w-5 text-purple-600" />
              <span>Questions Asked ({questionTree.length})</span>
            </h2>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {questionTree.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No questions tracked</p>
              ) : (
                questionTree.map((q, idx) => (
                  <div key={q.id} className="p-3 bg-purple-50 border-l-4 border-purple-400 rounded-lg">
                    <p className="text-sm text-gray-800 mb-2">{q.question}</p>
                    <div className="flex items-center space-x-3 text-xs text-gray-600">
                      {q.role && <span>Role: {q.role}</span>}
                      {q.stage && <span>Stage: {q.stage}</span>}
                      <span>{formatTime(q.timestamp)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Error Analysis */}
          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center space-x-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <span>Error Analysis ({detectedErrors.length})</span>
            </h2>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {detectedErrors.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-2" />
                  <p className="text-green-700 font-medium">No errors detected!</p>
                </div>
              ) : (
                detectedErrors.map((error, idx) => {
                  const severityColors = {
                    'high': 'bg-red-100 border-red-300 text-red-800',
                    'medium': 'bg-orange-100 border-orange-300 text-orange-800',
                    'low': 'bg-yellow-100 border-yellow-300 text-yellow-800'
                  };
                  return (
                    <div key={idx} className={`p-3 rounded-lg border-2 ${severityColors[error.severity]}`}>
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-semibold text-sm">{error.type}</p>
                        <span className="font-bold text-sm">×{error.count}</span>
                      </div>
                      <p className="text-xs opacity-90">{error.description}</p>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Structured Evidence */}
          {structuredEvidence.length > 0 && (
            <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center space-x-2">
                <TrendingUp className="h-5 w-5 text-green-600" />
                <span>Structured Evidence ({structuredEvidence.length})</span>
              </h2>
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {structuredEvidence.map((evidence, idx) => (
                  <div key={idx} className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm text-green-700">{evidence.type}</span>
                      <span className="text-xs text-green-600">{(evidence.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <p className="text-sm text-gray-700 mb-1">{evidence.content}</p>
                    <span className="text-xs text-blue-600">Stage: {evidence.stage}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Uncertainty Record */}
          {uncertaintyRecord.length > 0 && (
            <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center space-x-2">
                <AlertCircle className="h-5 w-5 text-orange-600" />
                <span>Uncertainty Record ({uncertaintyRecord.length})</span>
              </h2>
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {uncertaintyRecord.map((record, idx) => (
                  <div key={idx} className="p-3 bg-orange-50 border-l-4 border-orange-400 rounded-lg">
                    <p className="text-sm text-gray-800 mb-2">{record.content}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-blue-600">Stage: {record.stage}</span>
                      <span className="text-xs text-orange-700">Confidence: {(record.confidence * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Advanced Analytics Section */}
        <div className="mt-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center space-x-2">
            <Layers className="h-6 w-6 text-indigo-600" />
            <span>Advanced Analytics & Visualizations</span>
          </h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Advanced Plot 1: Message Timeline Analysis */}
            {messageTimelineData.times.length > 0 && (
              <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center space-x-2">
                  <Activity className="h-5 w-5 text-blue-600" />
                  <span>Message Timeline Analysis</span>
                </h3>
                <Plot
                  data={[
                    {
                      type: 'scatter',
                      mode: 'lines+markers',
                      x: messageTimelineData.times,
                      y: messageTimelineData.userCounts,
                      name: 'User Messages',
                      line: { color: '#3B82F6', width: 3 },
                      marker: { color: '#3B82F6', size: 8 }
                    },
                    {
                      type: 'scatter',
                      mode: 'lines+markers',
                      x: messageTimelineData.times,
                      y: messageTimelineData.assistantCounts,
                      name: 'AI Responses',
                      line: { color: '#A855F7', width: 3 },
                      marker: { color: '#A855F7', size: 8 }
                    },
                    {
                      type: 'scatter',
                      mode: 'lines',
                      x: messageTimelineData.times,
                      y: messageTimelineData.counts,
                      name: 'Total Messages',
                      line: { color: '#10B981', width: 2, dash: 'dash' },
                      fill: 'tonexty',
                      fillcolor: 'rgba(16, 185, 129, 0.1)'
                    }
                  ] as any}
                  layout={{
                    height: 350,
                    margin: { l: 60, r: 30, t: 30, b: 50 },
                    paper_bgcolor: 'rgba(0,0,0,0)',
                    plot_bgcolor: 'rgba(0,0,0,0)',
                    font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                    xaxis: { title: 'Time (minutes)', showgrid: true, gridcolor: '#F3F4F6' },
                    yaxis: { title: 'Message Count', showgrid: true, gridcolor: '#F3F4F6' },
                    legend: { x: 0.7, y: 1, bgcolor: 'rgba(255,255,255,0.8)' },
                    hovermode: 'x unified'
                  }}
                  config={{ displayModeBar: false, responsive: true }}
                  style={{ width: '100%', height: '100%' }}
                />
              </div>
            )}

            {/* Advanced Plot 2: Stage Transition Heatmap */}
            <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center space-x-2">
                <Network className="h-5 w-5 text-purple-600" />
                <span>Stage Transition Matrix</span>
              </h3>
              <Plot
                data={[{
                  type: 'heatmap',
                  z: stageTransitionMatrix,
                  x: stageLabels,
                  y: stageLabels,
                  colorscale: [
                    [0, '#E5E7EB'],
                    [0.2, '#DBEAFE'],
                    [0.4, '#BFDBFE'],
                    [0.6, '#93C5FD'],
                    [0.8, '#60A5FA'],
                    [1, '#3B82F6']
                  ],
                  showscale: true,
                  colorbar: { title: 'Transitions', titlefont: { size: 11 } },
                  hovertemplate: 'From: %{y}<br>To: %{x}<br>Count: %{z}<extra></extra>'
                }] as any}
                layout={{
                  height: 350,
                  margin: { l: 80, r: 30, t: 30, b: 80 },
                  paper_bgcolor: 'rgba(0,0,0,0)',
                  plot_bgcolor: 'rgba(0,0,0,0)',
                  font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                  xaxis: { title: 'To Stage', side: 'bottom' },
                  yaxis: { title: 'From Stage', autorange: 'reversed' }
                }}
                config={{ displayModeBar: false, responsive: true }}
                style={{ width: '100%', height: '100%' }}
              />
            </div>

            {/* Advanced Plot 3: Message Length Distribution */}
            {messageLengthData.userLengths.length > 0 && (
              <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center space-x-2">
                  <BarChart3 className="h-5 w-5 text-green-600" />
                  <span>Message Length Distribution</span>
                </h3>
                <Plot
                  data={[
                    {
                      type: 'histogram',
                      x: messageLengthData.userLengths,
                      name: 'User Messages',
                      opacity: 0.7,
                      marker: { color: '#3B82F6' },
                      nbinsx: 20
                    },
                    {
                      type: 'histogram',
                      x: messageLengthData.assistantLengths,
                      name: 'AI Responses',
                      opacity: 0.7,
                      marker: { color: '#A855F7' },
                      nbinsx: 20
                    }
                  ] as any}
                  layout={{
                    height: 350,
                    margin: { l: 60, r: 30, t: 30, b: 50 },
                    paper_bgcolor: 'rgba(0,0,0,0)',
                    plot_bgcolor: 'rgba(0,0,0,0)',
                    font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                    xaxis: { title: 'Message Length (characters)', showgrid: true, gridcolor: '#F3F4F6' },
                    yaxis: { title: 'Frequency', showgrid: true, gridcolor: '#F3F4F6' },
                    barmode: 'overlay',
                    legend: { x: 0.7, y: 1, bgcolor: 'rgba(255,255,255,0.8)' }
                  }}
                  config={{ displayModeBar: false, responsive: true }}
                  style={{ width: '100%', height: '100%' }}
                />
              </div>
            )}

            {/* Advanced Plot 4: Stage Evolution Over Time */}
            {Object.values(stageEvolutionData).some(s => s.x.length > 0) && (
              <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center space-x-2">
                  <TrendingUp className="h-5 w-5 text-orange-600" />
                  <span>Stage Evolution Over Time</span>
                </h3>
                <Plot
                  data={phases.map((phase, idx) => ({
                    type: 'scatter',
                    mode: 'markers+lines',
                    x: stageEvolutionData[phase.id]?.x || [],
                    y: stageEvolutionData[phase.id]?.y || [],
                    name: phase.name,
                    line: { color: phase.color, width: 2 },
                    marker: { color: phase.color, size: 8, symbol: idx % 5 }
                  })) as any}
                  layout={{
                    height: 350,
                    margin: { l: 60, r: 30, t: 30, b: 50 },
                    paper_bgcolor: 'rgba(0,0,0,0)',
                    plot_bgcolor: 'rgba(0,0,0,0)',
                    font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                    xaxis: { title: 'Time (minutes)', showgrid: true, gridcolor: '#F3F4F6' },
                    yaxis: { title: 'Message Index', showgrid: true, gridcolor: '#F3F4F6' },
                    legend: { x: 1.02, y: 1, bgcolor: 'rgba(255,255,255,0.8)' }
                  }}
                  config={{ displayModeBar: false, responsive: true }}
                  style={{ width: '100%', height: '100%' }}
                />
              </div>
            )}

            {/* Advanced Plot 5: Role-Stage Correlation Heatmap */}
            <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center space-x-2">
                <Brain className="h-5 w-5 text-indigo-600" />
                <span>Role-Stage Correlation</span>
              </h3>
              <Plot
                data={[{
                  type: 'heatmap',
                  z: roleLabels.map(role => 
                    stageLabels.map(stage => {
                      const roleKey = role.toLowerCase();
                      return roleStageCorrelation[roleKey]?.[stage] || 0;
                    })
                  ),
                  x: stageLabels,
                  y: roleLabels,
                  colorscale: [
                    [0, '#F3F4F6'],
                    [0.25, '#DBEAFE'],
                    [0.5, '#BFDBFE'],
                    [0.75, '#60A5FA'],
                    [1, '#3B82F6']
                  ],
                  showscale: true,
                  colorbar: { title: 'Usage Count', titlefont: { size: 11 } },
                  hovertemplate: 'Role: %{y}<br>Stage: %{x}<br>Count: %{z}<extra></extra>'
                }] as any}
                layout={{
                  height: 350,
                  margin: { l: 100, r: 30, t: 30, b: 80 },
                  paper_bgcolor: 'rgba(0,0,0,0)',
                  plot_bgcolor: 'rgba(0,0,0,0)',
                  font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                  xaxis: { title: 'Cognitive Stage' },
                  yaxis: { title: 'AI Role', autorange: 'reversed' }
                }}
                config={{ displayModeBar: false, responsive: true }}
                style={{ width: '100%', height: '100%' }}
              />
            </div>

            {/* Advanced Plot 6: Error Timeline */}
            {errorTimelineData.length > 0 && (
              <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center space-x-2">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  <span>Error Timeline</span>
                </h3>
                <Plot
                  data={[
                    {
                      type: 'scatter',
                      mode: 'markers+lines',
                      x: errorTimelineData.map(e => e.x),
                      y: errorTimelineData.map(e => e.count),
                      text: errorTimelineData.map(e => e.type),
                      marker: {
                        size: errorTimelineData.map(e => e.count * 5 + 10),
                        color: errorTimelineData.map(e => 
                          e.severity === 'high' ? '#EF4444' : 
                          e.severity === 'medium' ? '#F97316' : '#EAB308'
                        ),
                        line: { width: 2, color: '#fff' }
                      },
                      line: { color: '#EF4444', width: 2, dash: 'dot' },
                      hovertemplate: '<b>%{text}</b><br>Time: %{x:.1f} min<br>Count: %{y}<extra></extra>'
                    }
                  ] as any}
                  layout={{
                    height: 350,
                    margin: { l: 60, r: 30, t: 30, b: 50 },
                    paper_bgcolor: 'rgba(0,0,0,0)',
                    plot_bgcolor: 'rgba(0,0,0,0)',
                    font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                    xaxis: { title: 'Time (minutes)', showgrid: true, gridcolor: '#F3F4F6' },
                    yaxis: { title: 'Error Count', showgrid: true, gridcolor: '#F3F4F6' }
                  }}
                  config={{ displayModeBar: false, responsive: true }}
                  style={{ width: '100%', height: '100%' }}
                />
              </div>
            )}

            {/* Advanced Plot 7: Uncertainty Confidence Distribution */}
            {uncertaintyData.confidences.length > 0 && (
              <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center space-x-2">
                  <AlertCircle className="h-5 w-5 text-orange-600" />
                  <span>Uncertainty Confidence Distribution</span>
                </h3>
                <Plot
                  data={[{
                    type: 'violin',
                    y: uncertaintyData.confidences,
                    box: { visible: true },
                    meanline: { visible: true },
                    hovertemplate: 'Confidence: %{y:.1f}%<extra></extra>',
                    marker: { color: '#F97316' },
                    fillcolor: 'rgba(249, 115, 22, 0.3)',
                    line: { color: '#F97316' }
                  }] as any}
                  layout={{
                    height: 350,
                    margin: { l: 60, r: 30, t: 30, b: 50 },
                    paper_bgcolor: 'rgba(0,0,0,0)',
                    plot_bgcolor: 'rgba(0,0,0,0)',
                    font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                    yaxis: { title: 'Confidence (%)', showgrid: true, gridcolor: '#F3F4F6', range: [0, 100] }
                  }}
                  config={{ displayModeBar: false, responsive: true }}
                  style={{ width: '100%', height: '100%' }}
                />
              </div>
            )}

            {/* Advanced Plot 8: Conversation Flow Sankey Diagram */}
            {conversationFlowData.nodes.length > 0 && (
              <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center space-x-2">
                  <Network className="h-5 w-5 text-blue-600" />
                  <span>Conversation Flow Network</span>
                </h3>
                <Plot
                  data={[{
                    type: 'sankey',
                    node: {
                      label: conversationFlowData.nodes.map(n => n.label),
                      color: conversationFlowData.nodes.map(n => {
                        if (n.group === 0) return '#3B82F6';
                        const colors = ['#6366F1', '#A855F7', '#10B981', '#EAB308', '#3B82F6'];
                        return colors[n.group - 1] || '#9CA3AF';
                      }),
                      pad: 15,
                      thickness: 20
                    },
                    link: {
                      source: conversationFlowData.links.map(l => l.source),
                      target: conversationFlowData.links.map(l => l.target),
                      value: conversationFlowData.links.map(l => l.value),
                      color: 'rgba(156, 163, 175, 0.4)'
                    }
                  }] as any}
                  layout={{
                    height: 400,
                    margin: { l: 30, r: 30, t: 30, b: 30 },
                    paper_bgcolor: 'rgba(0,0,0,0)',
                    plot_bgcolor: 'rgba(0,0,0,0)',
                    font: { size: 10, family: 'Inter, system-ui, sans-serif' }
                  }}
                  config={{ displayModeBar: false, responsive: true }}
                  style={{ width: '100%', height: '100%' }}
                />
              </div>
            )}

            {/* Advanced Plot 9: Response Time Analysis */}
            {responseTimeData.length > 0 && (
              <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center space-x-2">
                  <Clock className="h-5 w-5 text-purple-600" />
                  <span>AI Response Time Analysis</span>
                </h3>
                <Plot
                  data={[
                    {
                      type: 'box',
                      y: responseTimeData,
                      name: 'Response Time',
                      boxpoints: 'outliers',
                      marker: { color: '#A855F7' },
                      fillcolor: 'rgba(168, 85, 247, 0.3)',
                      line: { color: '#A855F7' }
                    },
                    {
                      type: 'scatter',
                      mode: 'markers',
                      y: responseTimeData,
                      x: Array(responseTimeData.length).fill(0).map((_, i) => i + 1),
                      name: 'Individual Responses',
                      marker: { color: '#7C3AED', size: 6, opacity: 0.6 }
                    }
                  ] as any}
                  layout={{
                    height: 350,
                    margin: { l: 60, r: 30, t: 30, b: 50 },
                    paper_bgcolor: 'rgba(0,0,0,0)',
                    plot_bgcolor: 'rgba(0,0,0,0)',
                    font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                    xaxis: { title: 'Response Number', showgrid: true, gridcolor: '#F3F4F6' },
                    yaxis: { title: 'Response Time (seconds)', showgrid: true, gridcolor: '#F3F4F6', type: 'log' },
                    showlegend: true,
                    legend: { x: 0.7, y: 1, bgcolor: 'rgba(255,255,255,0.8)' }
                  }}
                  config={{ displayModeBar: false, responsive: true }}
                  style={{ width: '100%', height: '100%' }}
                />
              </div>
            )}

            {/* Advanced Plot 10: 3D Scatter Plot - Message Position, Time, and Length */}
            {threeDScatterData.x.length > 0 && (
              <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200 lg:col-span-2">
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center space-x-2">
                  <Layers className="h-5 w-5 text-indigo-600" />
                  <span>3D Message Analysis - Position, Time & Length</span>
                </h3>
                <Plot
                  data={[{
                    type: 'scatter3d',
                    mode: 'markers',
                    x: threeDScatterData.x,
                    y: threeDScatterData.y,
                    z: threeDScatterData.z,
                    text: threeDScatterData.text,
                    marker: {
                      size: 5,
                      color: threeDScatterData.colors,
                      opacity: 0.8,
                      line: { width: 1, color: '#fff' },
                      colorscale: 'Viridis',
                      showscale: false
                    },
                    hovertemplate: '<b>%{text}</b><br>' +
                      'Position: %{x}<br>' +
                      'Time: %{y:.1f} min<br>' +
                      'Length: %{z} chars<extra></extra>'
                  }] as any}
                  layout={{
                    height: 500,
                    margin: { l: 0, r: 0, t: 30, b: 0 },
                    paper_bgcolor: 'rgba(0,0,0,0)',
                    plot_bgcolor: 'rgba(0,0,0,0)',
                    font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                    scene: {
                      xaxis: { title: 'Message Index', showgrid: true, gridcolor: '#E5E7EB', backgroundcolor: 'rgba(255,255,255,0.1)' },
                      yaxis: { title: 'Time (minutes)', showgrid: true, gridcolor: '#E5E7EB', backgroundcolor: 'rgba(255,255,255,0.1)' },
                      zaxis: { title: 'Message Length (chars)', showgrid: true, gridcolor: '#E5E7EB', backgroundcolor: 'rgba(255,255,255,0.1)' },
                      bgcolor: 'rgba(255,255,255,0)',
                      camera: {
                        eye: { x: 1.5, y: 1.5, z: 1.5 },
                        center: { x: 0, y: 0, z: 0 },
                        up: { x: 0, y: 0, z: 1 }
                      }
                    }
                  }}
                  config={{ displayModeBar: true, responsive: true }}
                  style={{ width: '100%', height: '100%' }}
                />
                <div className="mt-4 flex flex-wrap gap-2 justify-center">
                  <div className="flex items-center space-x-1">
                    <div className="w-3 h-3 rounded-full bg-blue-600"></div>
                    <span className="text-xs text-gray-600">User</span>
                  </div>
                  {['Clarify', 'Plan', 'Execute', 'Verify', 'Reflect'].map((stage, idx) => (
                    <div key={stage} className="flex items-center space-x-1">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stageColors[idx] }}></div>
                      <span className="text-xs text-gray-600">{stage}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Advanced Plot 11: Parallel Coordinates Plot - Multi-dimensional Analysis */}
            {parallelCoordinatesData.length > 0 && (
              <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200 lg:col-span-2">
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center space-x-2">
                  <Activity className="h-5 w-5 text-purple-600" />
                  <span>Parallel Coordinates - Multi-Dimensional Conversation Analysis</span>
                </h3>
                <Plot
                  data={[{
                    type: 'parcoords',
                    line: {
                      color: parallelCoordinatesData.map((_, idx) => idx),
                      colorscale: 'Viridis',
                      showscale: true,
                      colorbar: { title: 'Message Order', titlefont: { size: 11 } },
                      cmin: 0,
                      cmax: parallelCoordinatesData.length - 1
                    },
                    dimensions: [
                      {
                        label: 'Message Index',
                        values: parallelCoordinatesData.map(d => d['Message Index']),
                        range: [0, Math.max(...parallelCoordinatesData.map(d => d['Message Index']))]
                      },
                      {
                        label: 'Time (min)',
                        values: parallelCoordinatesData.map(d => d['Time (min)']),
                        range: [0, Math.max(...parallelCoordinatesData.map(d => d['Time (min)']))]
                      },
                      {
                        label: 'Length (chars)',
                        values: parallelCoordinatesData.map(d => d['Length (chars)']),
                        range: [0, Math.max(...parallelCoordinatesData.map(d => d['Length (chars)']))]
                      },
                      {
                        label: 'Stage Index',
                        values: parallelCoordinatesData.map(d => d['Stage Index']),
                        range: [0, 4],
                        tickvals: [0, 1, 2, 3, 4],
                        ticktext: ['Clarify', 'Plan', 'Execute', 'Verify', 'Reflect']
                      },
                      {
                        label: 'Role Index',
                        values: parallelCoordinatesData.map(d => d['Role Index']),
                        range: [0, 3],
                        tickvals: [0, 1, 2, 3],
                        ticktext: ['Analyst', 'Experimenter', 'Reviewer', 'Summarizer']
                      },
                      {
                        label: 'Word Count',
                        values: parallelCoordinatesData.map(d => d['Word Count']),
                        range: [0, Math.max(...parallelCoordinatesData.map(d => d['Word Count']))]
                      },
                      {
                        label: 'Has Questions',
                        values: parallelCoordinatesData.map(d => d['Has Questions']),
                        range: [0, 1],
                        tickvals: [0, 1],
                        ticktext: ['No', 'Yes']
                      },
                      {
                        label: 'Turn Number',
                        values: parallelCoordinatesData.map(d => d['Turn Number']),
                        range: [1, Math.max(...parallelCoordinatesData.map(d => d['Turn Number']))]
                      }
                    ]
                  }] as any}
                  layout={{
                    height: 450,
                    margin: { l: 80, r: 80, t: 30, b: 50 },
                    paper_bgcolor: 'rgba(0,0,0,0)',
                    plot_bgcolor: 'rgba(0,0,0,0)',
                    font: { size: 10, family: 'Inter, system-ui, sans-serif' }
                  }}
                  config={{ displayModeBar: true, responsive: true }}
                  style={{ width: '100%', height: '100%' }}
                />
                <p className="text-xs text-gray-500 mt-2 text-center">
                  Drag along axes to filter data. Each line represents one message connecting all dimensions.
                </p>
              </div>
            )}

            {/* Advanced Plot 12: Ternary Plot - Stage Balance */}
            <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200 lg:col-span-2 overflow-hidden">
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center space-x-2">
                  <Target className="h-5 w-5 text-green-600" />
                  <span>Ternary Plot - Cognitive Stage Balance Over Time</span>
                </h3>
              {ternaryData.a.length > 0 ? (
                <div className="w-full overflow-hidden">
                <Plot
                  data={[{
                    type: 'scatterternary',
                      mode: ternaryData.a.length > 1 ? 'markers+lines' : 'markers',
                    a: ternaryData.a,
                    b: ternaryData.b,
                    c: ternaryData.c,
                    text: ternaryData.time.map(t => `Time: ${t.toFixed(1)} min`),
                    marker: {
                        size: ternaryData.a.length === 1 ? 20 : 12,
                      color: ternaryData.colors,
                      line: { width: 2, color: '#fff' },
                      opacity: 0.8
                    },
                      line: ternaryData.a.length > 1 ? {
                      color: '#9CA3AF',
                      width: 2,
                      dash: 'dot'
                      } : undefined,
                    hovertemplate: '<b>%{text}</b><br>' +
                      'Clarify: %{a:.1f}%<br>' +
                      'Plan+Execute: %{b:.1f}%<br>' +
                      'Verify+Reflect: %{c:.1f}%<extra></extra>',
                      fill: ternaryData.a.length > 1 ? 'toself' : undefined,
                      fillcolor: ternaryData.a.length > 1 ? 'rgba(168, 85, 247, 0.1)' : undefined
                  }] as any}
                  layout={{
                    height: 500,
                      autosize: true,
                      margin: { l: 60, r: 60, t: 40, b: 40 },
                    paper_bgcolor: 'rgba(0,0,0,0)',
                    plot_bgcolor: 'rgba(0,0,0,0)',
                    font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                    ternary: {
                      sum: 100,
                      aaxis: {
                        title: { text: 'Clarify', font: { size: 12 } },
                        min: 0,
                        linewidth: 2,
                          ticks: 'inside',
                          gridcolor: '#E5E7EB',
                          tickfont: { size: 10 }
                      },
                      baxis: {
                        title: { text: 'Plan + Execute', font: { size: 12 } },
                        min: 0,
                        linewidth: 2,
                          ticks: 'inside',
                          gridcolor: '#E5E7EB',
                          tickfont: { size: 10 }
                      },
                      caxis: {
                        title: { text: 'Verify + Reflect', font: { size: 12 } },
                        min: 0,
                        linewidth: 2,
                          ticks: 'inside',
                          gridcolor: '#E5E7EB',
                          tickfont: { size: 10 }
                      },
                      bgcolor: 'rgba(255,255,255,0)'
                    },
                    showlegend: false
                  }}
                  config={{ displayModeBar: true, responsive: true }}
                    style={{ width: '100%', height: '100%', maxWidth: '100%' }}
                  />
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <Target className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No stage data available for ternary plot visualization.</p>
                  <p className="text-xs mt-2">Ensure AI assistant messages have detected stages.</p>
                </div>
              )}
              {ternaryData.a.length > 0 && (
                <>
                <div className="mt-4 flex flex-wrap gap-4 justify-center">
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 rounded-full bg-blue-600"></div>
                    <span className="text-sm text-gray-700">Clarify Dominant</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 rounded-full bg-green-600"></div>
                    <span className="text-sm text-gray-700">Plan/Execute Dominant</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 rounded-full bg-indigo-600"></div>
                    <span className="text-sm text-gray-700">Verify/Reflect Dominant</span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2 text-center">
                    {ternaryData.a.length === 1 
                      ? 'Single data point showing overall stage distribution.'
                      : 'Each point represents a time window. Position shows the balance between the three stage groups.'}
                </p>
                </>
            )}
            </div>
          </div>
        </div>

        {/* Conversation Timeline */}
        <div className="mt-6 bg-white rounded-xl shadow-md p-6 border border-gray-200">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center space-x-2">
            <MessageSquare className="h-5 w-5 text-blue-600" />
            <span>Full Conversation ({messages.length} messages)</span>
          </h2>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {messages.map((message, index) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-2xl px-4 py-3 rounded-lg ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-900 border border-gray-200'
                  }`}
                >
                  <div className="flex items-start space-x-2">
                    <div className="flex-1">
                      {message.detectedStage && message.role === 'assistant' && (
                        <div className="mb-2">
                          <span className="text-xs px-2 py-1 bg-indigo-100 text-indigo-700 rounded">
                            {message.detectedStage}
                          </span>
                        </div>
                      )}
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className={`text-xs ${message.role === 'user' ? 'text-blue-200' : 'text-gray-500'}`}>
                          Turn {Math.floor(index / 2) + 1}
                        </span>
                        <span className={`text-xs ${message.role === 'user' ? 'text-blue-200' : 'text-gray-500'}`}>
                          {formatTime(message.timestamp)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Marker Section */}
        <div className="mt-6 bg-gradient-to-br from-purple-50 via-indigo-50 to-blue-50 rounded-xl shadow-lg p-6 border-2 border-purple-200">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900 flex items-center space-x-3">
              <Target className="h-7 w-7 text-purple-600" />
              <span>AI Marker - Intelligent Scoring System</span>
            </h2>
            {isGeneratingMarker && (
              <div className="flex items-center space-x-2 text-gray-600">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Analyzing...</span>
              </div>
            )}
          </div>

          {aiMarkerAnalysis ? (
            <div className="space-y-6">
              {/* Overall Score */}
              <div className="bg-white rounded-lg p-6 border border-purple-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">Overall Score</h3>
                  <div className="text-right">
                    <div className="text-4xl font-bold text-purple-600">{aiMarkerAnalysis.overallScore}</div>
                    <div className="text-sm text-gray-500">Out of 100</div>
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-4">
                  <div 
                    className="bg-gradient-to-r from-purple-500 to-indigo-500 h-4 rounded-full transition-all duration-500"
                    style={{ width: `${aiMarkerAnalysis.overallScore}%` }}
                  />
                </div>
              </div>

              {/* Category Scores - Radar Chart */}
              <div className="bg-white rounded-lg p-6 border border-purple-200 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Category Score Analysis</h3>
                <Plot
                  data={[{
                    type: 'scatterpolar',
                    r: [
                      aiMarkerAnalysis.categoryScores.sentiment || 0,
                      aiMarkerAnalysis.categoryScores.communication || 0,
                      aiMarkerAnalysis.categoryScores.problemSolving || 0,
                      aiMarkerAnalysis.categoryScores.engagement || 0,
                      aiMarkerAnalysis.categoryScores.collaboration || 0,
                      aiMarkerAnalysis.categoryScores.sentiment || 0
                    ],
                    theta: ['Sentiment', 'Communication', 'Problem Solving', 'Engagement', 'AI Collaboration', 'Sentiment'],
                    fill: 'toself',
                    fillcolor: 'rgba(139, 92, 246, 0.3)',
                    line: { color: '#8B5CF6', width: 3 },
                    marker: { color: '#8B5CF6', size: 10 },
                    name: 'Score',
                    hovertemplate: '<b>%{theta}</b><br>Score: %{r}<extra></extra>',
                  }] as any}
                  layout={{
                    polar: {
                      bgcolor: 'rgba(255,255,255,0.0)',
                      radialaxis: {
                        gridcolor: '#E5E7EB',
                        linecolor: '#E5E7EB',
                        tickfont: { size: 11 },
                        range: [0, 100],
                        tickmode: 'linear',
                        tick0: 0,
                        dtick: 20
                      },
                      angularaxis: {
                        gridcolor: '#E5E7EB',
                        linecolor: '#E5E7EB',
                        tickfont: { size: 12 }
                      }
                    },
                    height: 400,
                    margin: { l: 80, r: 80, t: 40, b: 40 },
                    paper_bgcolor: 'rgba(0,0,0,0)',
                    plot_bgcolor: 'rgba(0,0,0,0)',
                    font: { size: 12, family: 'Inter, system-ui, sans-serif' },
                    showlegend: false
                  }}
                  config={{ displayModeBar: false, responsive: true }}
                  style={{ width: '100%', height: '100%' }}
                />
              </div>

              {/* Category Scores - Bar Chart */}
              <div className="bg-white rounded-lg p-6 border border-purple-200 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Detailed Category Scores</h3>
                <Plot
                  data={[{
                    type: 'bar',
                    x: ['Sentiment', 'Communication', 'Problem Solving', 'Engagement', 'AI Collaboration'],
                    y: [
                      aiMarkerAnalysis.categoryScores.sentiment || 0,
                      aiMarkerAnalysis.categoryScores.communication || 0,
                      aiMarkerAnalysis.categoryScores.problemSolving || 0,
                      aiMarkerAnalysis.categoryScores.engagement || 0,
                      aiMarkerAnalysis.categoryScores.collaboration || 0
                    ],
                    marker: {
                      color: [
                        (aiMarkerAnalysis.categoryScores.sentiment || 0) >= 80 ? '#10B981' :
                        (aiMarkerAnalysis.categoryScores.sentiment || 0) >= 60 ? '#3B82F6' : '#EF4444',
                        (aiMarkerAnalysis.categoryScores.communication || 0) >= 80 ? '#10B981' :
                        (aiMarkerAnalysis.categoryScores.communication || 0) >= 60 ? '#3B82F6' : '#EF4444',
                        (aiMarkerAnalysis.categoryScores.problemSolving || 0) >= 80 ? '#10B981' :
                        (aiMarkerAnalysis.categoryScores.problemSolving || 0) >= 60 ? '#3B82F6' : '#EF4444',
                        (aiMarkerAnalysis.categoryScores.engagement || 0) >= 80 ? '#10B981' :
                        (aiMarkerAnalysis.categoryScores.engagement || 0) >= 60 ? '#3B82F6' : '#EF4444',
                        (aiMarkerAnalysis.categoryScores.collaboration || 0) >= 80 ? '#10B981' :
                        (aiMarkerAnalysis.categoryScores.collaboration || 0) >= 60 ? '#3B82F6' : '#EF4444'
                      ],
                      line: { width: 2, color: '#fff' }
                    },
                    text: [
                      `${aiMarkerAnalysis.categoryScores.sentiment || 0}`,
                      `${aiMarkerAnalysis.categoryScores.communication || 0}`,
                      `${aiMarkerAnalysis.categoryScores.problemSolving || 0}`,
                      `${aiMarkerAnalysis.categoryScores.engagement || 0}`,
                      `${aiMarkerAnalysis.categoryScores.collaboration || 0}`
                    ],
                    textposition: 'outside',
                    hovertemplate: '<b>%{x}</b><br>Score: %{y}<extra></extra>',
                  }] as any}
                  layout={{
                    height: 350,
                    margin: { l: 60, r: 30, t: 30, b: 60 },
                    paper_bgcolor: 'rgba(0,0,0,0)',
                    plot_bgcolor: 'rgba(0,0,0,0)',
                    font: { size: 12, family: 'Inter, system-ui, sans-serif' },
                    xaxis: { 
                      title: '',
                      showgrid: true,
                      gridcolor: '#F3F4F6'
                    },
                    yaxis: { 
                      title: 'Score',
                      showgrid: true,
                      gridcolor: '#F3F4F6',
                      range: [0, 100]
                    },
                    showlegend: false
                  }}
                  config={{ displayModeBar: false, responsive: true }}
                  style={{ width: '100%', height: '100%' }}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Strengths */}
                <div className="bg-green-50 rounded-lg p-6 border border-green-200 shadow-sm">
                  <h3 className="text-lg font-semibold text-green-800 mb-4 flex items-center space-x-2">
                    <CheckCircle className="h-5 w-5" />
                    <span>Strengths</span>
                  </h3>
                  <ul className="space-y-3">
                    {aiMarkerAnalysis.strengths.map((strength, index) => (
                      <li key={index} className="flex items-start space-x-3">
                        <div className="flex-shrink-0 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white text-xs font-bold mt-0.5">
                          {index + 1}
                        </div>
                        <p className="text-gray-700 flex-1">{strength}</p>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Weaknesses */}
                <div className="bg-orange-50 rounded-lg p-6 border border-orange-200 shadow-sm">
                  <h3 className="text-lg font-semibold text-orange-800 mb-4 flex items-center space-x-2">
                    <AlertCircle className="h-5 w-5" />
                    <span>Areas for Improvement</span>
                  </h3>
                  <ul className="space-y-3">
                    {aiMarkerAnalysis.weaknesses.map((weakness, index) => (
                      <li key={index} className="flex items-start space-x-3">
                        <div className="flex-shrink-0 w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center text-white text-xs font-bold mt-0.5">
                          {index + 1}
                        </div>
                        <p className="text-gray-700 flex-1">{weakness}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Detailed Analysis */}
              <div className="bg-white rounded-lg p-6 border border-purple-200 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center space-x-2">
                  <Brain className="h-5 w-5 text-indigo-600" />
                  <span>Detailed Analysis</span>
                </h3>
                <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {aiMarkerAnalysis.detailedAnalysis}
                </div>
              </div>

              {/* Recommendations */}
              <div className="bg-blue-50 rounded-lg p-6 border border-blue-200 shadow-sm">
                <h3 className="text-lg font-semibold text-blue-800 mb-4 flex items-center space-x-2">
                  <TrendingUp className="h-5 w-5" />
                  <span>Recommendations</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {aiMarkerAnalysis.recommendations.map((rec, index) => (
                    <div key={index} className="bg-white rounded-lg p-4 border border-blue-100 shadow-sm">
                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0 w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold">
                          {index + 1}
                        </div>
                        <p className="text-gray-700 flex-1">{rec}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-purple-600 mx-auto mb-4" />
              <p className="text-gray-600">Generating AI Marker analysis...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatReport;

