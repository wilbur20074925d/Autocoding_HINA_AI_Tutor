import type { Course, Exercise, Reflection, PromptLog, StudentProgress, CourseResource, CourseModule, Assignment } from '../types';

export const mockCourses: Course[] = [
  {
    id: 'bsds3001', 
    code: 'BSDS3002',
    name: 'Social Computing: Methods and Applications',
    description: '',
    teacherId: 'teacher1',
  },
  {
    id: 'bsds3002',
    code: 'BSDS3001',
    name: 'Social Computing: Methods and Applications',
    description: 'Explore computational methods for analyzing social networks, online communities, and digital behavior patterns',
    teacherId: 'teacher1',
  },
  {
    id: 'bsds3003',
    code: 'BSDS3003',
    name: 'Data Processing and Visualization',
    description: 'Master data processing pipelines, cleaning techniques, and create compelling visualizations for social data',
    teacherId: 'teacher1',
  },
  {
    id: 'bsds3004',
    code: 'BSDS3004',
    name: 'Introduction to Statistics',
    description: 'Statistical foundations, hypothesis testing, and inferential methods for social data analysis',
    teacherId: 'teacher1',
  },
];

export const mockExercises: Exercise[] = [
  // BSDS3001 - Lecture 01 Exercises
  {
    id: 'lecture01-ex1',
    courseId: 'bsds3001',
    title: 'Lecture 01 Exercises',
    lectureNumber: '01',
    description: 'Practice exercises based on Lecture 01 — Introduction to Social Computing. Apply concepts from the lecture materials to solve practical programming problems.',
    difficulty: 'beginner',
    type: 'coding',
    prompt: 'Based on Lecture 01 — Introduction to Social Computing, create a program that demonstrates understanding of social computing fundamentals. Create variables to represent social computing concepts and display them in a structured format.',
    starterCode: '# Lecture 01 — Introduction to Social Computing\n# Apply concepts from the lecture materials\n\n# Define variables for social computing concepts\nplatform_name = \nuser_count = \ninteraction_type = \n\n# Display social computing information\n',
    expectedOutput: 'Social Computing Platform: Twitter\nTotal Users: 450000000\nInteraction Type: Microblogging',
    workedExample: {
      problem: 'How do we represent social computing concepts using Python?',
      solution: '# Lecture 01 — Introduction to Social Computing\nplatform_name = "Twitter"\nuser_count = 450000000\ninteraction_type = "Microblogging"\n\nprint(f"Social Computing Platform: {platform_name}")\nprint(f"Total Users: {user_count}")\nprint(f"Interaction Type: {interaction_type}")',
      explanation: 'This solution demonstrates basic Python variable usage to represent social computing concepts covered in Lecture 01, including platform identification, user metrics, and interaction types.',
      keyLearningPoints: [
        'Social computing involves human-computer interaction in social contexts',
        'Variables store different types of data (strings, integers)',
        'String formatting displays information clearly',
        'Understanding platform characteristics is fundamental to social computing'
      ]
    },
    topics: ['Social Computing', 'Python Basics', 'Variables', 'Introduction'],
    isPublished: true,
  },
  {
    id: 'ex1b',
    courseId: 'bsds3001',
    title: 'Data Ethics Multiple Choice',
    description: 'Test your understanding of ethical principles in data collection.',
    difficulty: 'beginner',
    type: 'multiple-choice',
    prompt: 'Which of the following best describes the principle of "data minimization" in ethical data collection?',
    options: [
      'Collecting as much data as possible to ensure comprehensive analysis',
      'Collecting only the data that is necessary and relevant for the specific purpose',
      'Minimizing the time spent on data collection',
      'Reducing the cost of data storage'
    ],
    correctAnswer: 1,
    topics: ['Data Ethics', 'Privacy Principles', 'GDPR Compliance'],
    isPublished: true,
  },
  {
    id: 'ex1c',
    courseId: 'bsds3001',
    title: 'Reflection on Data Collection Ethics',
    description: 'Reflect on ethical considerations in social data science projects.',
    difficulty: 'intermediate',
    type: 'essay',
    prompt: 'Discuss the ethical challenges that arise when collecting social media data for research purposes. Consider issues of consent, privacy, and potential harm to individuals or communities. Provide specific examples and suggest best practices. (300-500 words)',
    sampleAnswer: 'Social media data collection presents unique ethical challenges that researchers must carefully navigate. The primary concerns include informed consent, privacy expectations, and potential harm to individuals and communities...',
    topics: ['Research Ethics', 'Social Media Data', 'Consent', 'Privacy'],
    isPublished: true,
  },
  {
    id: 'ex1d',
    courseId: 'bsds3001',
    title: 'Python Data Types and Variables',
    description: 'Practice working with different Python data types in social data contexts.',
    difficulty: 'beginner',
    type: 'coding',
    prompt: 'Create variables to store information about social media users. Include name (string), age (integer), follower count (integer), and is_verified (boolean). Then create a formatted message displaying this information.',
    starterCode: '# Social media user data\n# Create variables for user information\nname = \nage = \nfollower_count = \nis_verified = \n\n# Create a formatted message\nuser_info = \nprint(user_info)',
    expectedOutput: 'User: Alice Smith, Age: 25, Followers: 1500, Verified: True',
    workedExample: {
      problem: 'How do we store and display different types of user information?',
      solution: 'name = "Alice Smith"\nage = 25\nfollower_count = 1500\nis_verified = True\n\nuser_info = f"User: {name}, Age: {age}, Followers: {follower_count}, Verified: {is_verified}"\nprint(user_info)',
      explanation: 'This solution demonstrates proper use of different data types and f-string formatting for clear output.',
      keyLearningPoints: [
        'Strings store text data and require quotes',
        'Integers store whole numbers without quotes',
        'Booleans represent True/False values',
        'F-strings provide clean formatting for output'
      ]
    },
    topics: ['Variables', 'Data Types', 'String Formatting', 'Python Basics'],
    isPublished: true,
  },
  {
    id: 'ex1e',
    courseId: 'bsds3001',
    title: 'File Handling and CSV Processing',
    description: 'Learn to read and process CSV files containing social data.',
    difficulty: 'intermediate',
    type: 'coding',
    prompt: 'Write code to read a CSV file containing social media engagement data and calculate basic statistics.',
    starterCode: 'import csv\n\n# Sample data structure: username, posts, likes, shares\n# Read CSV file and calculate average engagement\n\nwith open("engagement_data.csv", "r") as file:\n    reader = csv.reader(file)\n    # Your code here\n    pass',
    expectedOutput: 'Average posts: 15.2\nAverage likes: 245.8\nTotal users: 100',
    topics: ['File I/O', 'CSV Processing', 'Data Analysis', 'Statistics'],
    isPublished: true,
  },
  {
    id: 'ex1f',
    courseId: 'bsds3001',
    title: 'Privacy Impact Assessment',
    description: 'Conduct a privacy impact assessment for a social data project.',
    difficulty: 'advanced',
    type: 'essay',
    prompt: 'You are planning a study to analyze Twitter data to understand public sentiment about climate change. Conduct a privacy impact assessment by identifying potential privacy risks, affected stakeholders, and mitigation strategies. Structure your response with clear sections for risk identification, impact analysis, and mitigation measures. (500-700 words)',
    sampleAnswer: 'Privacy Impact Assessment for Twitter Climate Sentiment Analysis\n\n1. Risk Identification:\n- Data re-identification risks despite anonymization\n- Potential exposure of political views and personal beliefs...',
    topics: ['Privacy Assessment', 'Risk Analysis', 'Data Protection', 'Research Ethics'],
    isPublished: true,
  },
  {
    id: 'ex1g',
    courseId: 'bsds3001',
    title: 'API Data Collection Ethics',
    description: 'Multiple choice questions on ethical API usage.',
    difficulty: 'intermediate',
    type: 'multiple-choice',
    prompt: 'When using a social media API for research, which of the following is the MOST important ethical consideration?',
    options: [
      'Maximizing the amount of data collected',
      'Ensuring compliance with platform terms of service and user privacy expectations',
      'Using the fastest data collection methods available',
      'Collecting data from as many users as possible'
    ],
    correctAnswer: 1,
    topics: ['API Ethics', 'Terms of Service', 'Data Collection', 'Privacy'],
    isPublished: true,
  },
  {
    id: 'ex1h',
    courseId: 'bsds3001',
    title: 'Data Minimization Principles',
    description: 'Apply data minimization principles to a research scenario.',
    difficulty: 'intermediate',
    type: 'short-answer',
    prompt: 'A researcher wants to study online learning patterns during COVID-19. They have access to detailed student data including grades, login times, click patterns, personal demographics, family income, and health records. Apply data minimization principles to determine what data should actually be collected and justify your decisions.',
    correctAnswer: 'For studying online learning patterns, collect: grades (learning outcomes), login times and duration (engagement patterns), and basic demographics (age, education level) for context. Exclude: detailed click patterns (too granular), family income and health records (not directly relevant to learning patterns). Justification: Data minimization requires collecting only data necessary for the specific research purpose.',
    topics: ['Data Minimization', 'Research Design', 'Privacy Principles', 'Data Selection'],
    isPublished: true,
  },
  {
    id: 'ex1i',
    courseId: 'bsds3001',
    title: 'Pandas Data Manipulation',
    description: 'Use Pandas to clean and analyze social media data.',
    difficulty: 'intermediate',
    type: 'coding',
    prompt: 'Use Pandas to load social media data, clean it by removing missing values, and calculate engagement rates.',
    starterCode: 'import pandas as pd\nimport numpy as np\n\n# Load sample social media data\ndata = {\n    "username": ["user1", "user2", "user3", None, "user5"],\n    "posts": [10, 15, None, 8, 12],\n    "likes": [100, 200, 150, None, 180],\n    "followers": [500, 800, 600, 400, 750]\n}\n\ndf = pd.DataFrame(data)\n\n# Clean data and calculate engagement rate\n# Engagement rate = likes per post\n',
    expectedOutput: 'Clean dataset with 3 users\nAverage engagement rate: 12.5 likes per post',
    topics: ['Pandas', 'Data Cleaning', 'Data Analysis', 'Social Media Metrics'],
    isPublished: true,
  },
  {
    id: 'ex1j',
    courseId: 'bsds3001',
    title: 'Reproducible Research Workflow',
    description: 'Design a reproducible workflow for a social data science project.',
    difficulty: 'advanced',
    type: 'essay',
    prompt: 'Design a reproducible research workflow for analyzing the relationship between social media usage and mental health outcomes. Your workflow should address data collection, processing, analysis, and reporting phases. Include specific tools, documentation practices, and quality control measures. Explain how your workflow ensures reproducibility and transparency. (400-600 words)',
    sampleAnswer: 'Reproducible Research Workflow for Social Media and Mental Health Analysis\n\n1. Data Collection Phase:\n- Use standardized APIs with documented parameters\n- Version control all data collection scripts...',
    topics: ['Reproducible Research', 'Workflow Design', 'Documentation', 'Quality Control'],
    isPublished: true,
  },
  // BSDS3001 (course id bsds3002) - Social Computing
  {
    id: 'ex2a',
    courseId: 'bsds3002',
    title: 'Social Network Analysis Basics',
    description: 'Apply conditional logic to analyze social network connections and user interactions.',
    difficulty: 'intermediate',
    type: 'coding',
    prompt: 'Create a program that analyzes social network connections. Use conditionals to categorize users based on their connection count and activity level.',
    starterCode: '# Social network analysis\nconnections = 150\nactivity_score = 75\n\n# Categorize user influence level\n# Consider: High (>100 connections, >80 activity)\n# Medium (50-100 connections, 50-80 activity)\n# Low (otherwise)\n',
    expectedOutput: 'User Influence: Medium\nRecommendation: Increase engagement',
    workedExample: {
      problem: 'How do we categorize social media users based on their network metrics?',
      solution: 'connections = 150\nactivity_score = 75\n\nif connections > 100 and activity_score > 80:\n    influence = "High"\n    recommendation = "Maintain current engagement"\nelif connections >= 50 and activity_score >= 50:\n    influence = "Medium"\n    recommendation = "Increase engagement"\nelse:\n    influence = "Low"\n    recommendation = "Build network connections"\n\nprint(f"User Influence: {influence}")\nprint(f"Recommendation: {recommendation}")',
      explanation: 'This solution uses nested conditionals to create a multi-dimensional classification system based on both network size and activity level.',
      keyLearningPoints: [
        'Use logical operators (and, or) for complex conditions',
        'Consider multiple metrics for comprehensive analysis',
        'Provide actionable recommendations based on categorization',
        'Structure conditionals from most specific to most general'
      ]
    },
    topics: ['Conditionals', 'Social Computing', 'Network Analysis', 'User Categorization'],
    isPublished: true,
  },
  {
    id: 'ex2c',
    courseId: 'bsds3002',
    title: 'NetworkX Graph Analysis',
    description: 'Use NetworkX to analyze social network properties.',
    difficulty: 'advanced',
    type: 'coding',
    prompt: 'Create a social network graph using NetworkX and calculate centrality measures for all nodes.',
    starterCode: 'import networkx as nx\nimport matplotlib.pyplot as plt\n\n# Create a sample social network\nG = nx.Graph()\n\n# Add nodes and edges\nnodes = ["Alice", "Bob", "Charlie", "Diana", "Eve"]\nG.add_nodes_from(nodes)\n\n# Add friendships (edges)\nfriendships = [("Alice", "Bob"), ("Bob", "Charlie"), ("Charlie", "Diana"), ("Alice", "Diana"), ("Diana", "Eve")]\nG.add_edges_from(friendships)\n\n# Calculate centrality measures\n',
    expectedOutput: 'Degree Centrality: Alice: 0.5, Bob: 0.5, Charlie: 0.5, Diana: 0.75, Eve: 0.25\nMost central user: Diana',
    topics: ['NetworkX', 'Graph Theory', 'Centrality Measures', 'Social Networks'],
    isPublished: true,
  },
  {
    id: 'ex2d',
    courseId: 'bsds3002',
    title: 'Information Diffusion Modeling',
    description: 'Model how information spreads through a social network.',
    difficulty: 'advanced',
    type: 'coding',
    prompt: 'Implement a simple information diffusion model where information spreads from initial adopters to their neighbors with a given probability.',
    starterCode: 'import random\nimport networkx as nx\n\ndef diffusion_step(G, infected, prob=0.3):\n    """One step of information diffusion"""\n    new_infected = set(infected)\n    \n    for node in infected:\n        for neighbor in G.neighbors(node):\n            if neighbor not in infected and random.random() < prob:\n                new_infected.add(neighbor)\n    \n    return new_infected\n\n# Create network and run simulation\n',
    expectedOutput: 'Step 0: 1 informed users\nStep 1: 2 informed users\nStep 2: 4 informed users\nFinal reach: 80% of network',
    topics: ['Information Diffusion', 'Network Simulation', 'Probabilistic Models', 'Social Influence'],
    isPublished: true,
  },
  {
    id: 'ex2e',
    courseId: 'bsds3002',
    title: 'Community Detection Analysis',
    description: 'Identify communities in social networks using clustering algorithms.',
    difficulty: 'advanced',
    type: 'multiple-choice',
    prompt: 'Which community detection algorithm is best suited for large-scale social networks with millions of nodes?',
    options: [
      'Girvan-Newman algorithm',
      'Louvain algorithm',
      'Hierarchical clustering',
      'K-means clustering'
    ],
    correctAnswer: 1,
    topics: ['Community Detection', 'Clustering Algorithms', 'Scalability', 'Network Analysis'],
    isPublished: true,
  },
  {
    id: 'ex2f',
    courseId: 'bsds3002',
    title: 'Social Influence Mechanisms',
    description: 'Analyze different mechanisms of social influence in online communities.',
    difficulty: 'intermediate',
    type: 'essay',
    prompt: 'Compare and contrast three different mechanisms of social influence in online communities: conformity, social proof, and authority. Provide examples of how each mechanism operates in digital environments and discuss their implications for information spread and behavior change. (400-500 words)',
    sampleAnswer: 'Social influence operates through multiple mechanisms in online communities, each with distinct characteristics and implications...',
    topics: ['Social Influence', 'Online Communities', 'Behavioral Psychology', 'Digital Sociology'],
    isPublished: true,
  },
  {
    id: 'ex2g',
    courseId: 'bsds3002',
    title: 'Sentiment Analysis Implementation',
    description: 'Implement basic sentiment analysis for social media posts.',
    difficulty: 'intermediate',
    type: 'coding',
    prompt: 'Create a simple sentiment analysis system that classifies social media posts as positive, negative, or neutral.',
    starterCode: '# Simple sentiment analysis\npositive_words = ["good", "great", "excellent", "amazing", "wonderful", "fantastic"]\nnegative_words = ["bad", "terrible", "awful", "horrible", "disappointing", "worst"]\n\ndef analyze_sentiment(text):\n    """Analyze sentiment of text"""\n    text = text.lower()\n    positive_count = sum(1 for word in positive_words if word in text)\n    negative_count = sum(1 for word in negative_words if word in text)\n    \n    # Your classification logic here\n    pass\n\n# Test with sample posts\nposts = [\n    "This movie is absolutely amazing!",\n    "The service was terrible and disappointing.",\n    "It was an okay experience, nothing special."\n]\n',
    expectedOutput: 'Post 1: Positive\nPost 2: Negative\nPost 3: Neutral',
    topics: ['Sentiment Analysis', 'Text Processing', 'Natural Language Processing', 'Social Media Analysis'],
    isPublished: true,
  },
  {
    id: 'ex2h',
    courseId: 'bsds3002',
    title: 'Digital Divide Assessment',
    description: 'Analyze factors contributing to digital inequality.',
    difficulty: 'intermediate',
    type: 'short-answer',
    prompt: 'A study finds that rural areas have 30% lower broadband adoption rates compared to urban areas. Identify three potential factors contributing to this digital divide and suggest one policy intervention for each factor.',
    correctAnswer: 'Factors: 1) Infrastructure - limited broadband availability; 2) Economic - higher costs relative to income; 3) Skills - lower digital literacy rates. Interventions: 1) Government broadband infrastructure investment; 2) Subsidized internet programs; 3) Digital literacy training programs.',
    topics: ['Digital Divide', 'Policy Analysis', 'Rural-Urban Inequality', 'Digital Access'],
    isPublished: true,
  },
  {
    id: 'ex2i',
    courseId: 'bsds3002',
    title: 'Platform Algorithm Analysis',
    description: 'Examine how recommendation algorithms shape user behavior.',
    difficulty: 'advanced',
    type: 'essay',
    prompt: 'Analyze how recommendation algorithms on social media platforms can create "filter bubbles" and "echo chambers." Discuss the mechanisms by which these algorithms operate, their intended benefits, unintended consequences, and potential solutions. Include specific examples from major platforms. (500-600 words)',
    sampleAnswer: 'Recommendation algorithms on social media platforms are designed to maximize user engagement by showing content similar to what users have previously interacted with...',
    topics: ['Recommendation Systems', 'Filter Bubbles', 'Echo Chambers', 'Algorithmic Bias'],
    isPublished: true,
  },
  {
    id: 'ex2j',
    courseId: 'bsds3002',
    title: 'Crowdsourcing Quality Control',
    description: 'Design quality control mechanisms for crowdsourcing platforms.',
    difficulty: 'advanced',
    type: 'multiple-choice',
    prompt: 'Which quality control mechanism is most effective for ensuring reliable results in crowdsourcing tasks?',
    options: [
      'Paying higher wages to all workers',
      'Using multiple workers per task with majority voting',
      'Requiring advanced degrees from all workers',
      'Limiting tasks to workers from specific countries'
    ],
    correctAnswer: 1,
    topics: ['Crowdsourcing', 'Quality Control', 'Collective Intelligence', 'Task Design'],
    isPublished: true,
  },
  {
    id: 'ex2b',
    courseId: 'bsds3002',
    title: 'Social Network Metrics',
    description: 'Calculate and interpret key social network metrics.',
    difficulty: 'intermediate',
    type: 'short-answer',
    prompt: 'Given a social network where User A has 50 direct connections, and the average number of connections among those 50 users is 30, calculate the clustering coefficient for User A. Show your calculation and explain what this metric indicates about the network structure.',
    correctAnswer: 'Clustering coefficient = 0.6 (30/50). This indicates that 60% of User A\'s connections are also connected to each other, suggesting a moderately clustered network.',
    topics: ['Network Metrics', 'Clustering Coefficient', 'Graph Theory'],
    isPublished: true,
  },
  // BSDS3003 - Data Processing and Visualization
  {
    id: 'ex3a',
    courseId: 'bsds3003',
    title: 'Data Cleaning and Preprocessing',
    description: 'Learn essential data cleaning techniques using Python lists and pandas operations.',
    difficulty: 'intermediate',
    type: 'coding',
    prompt: 'Clean a dataset containing social media posts. Remove invalid entries, handle missing data, and prepare the data for visualization.',
    starterCode: '# Data cleaning exercise\nimport pandas as pd\n\n# Sample messy social media data\nposts = ["Great day! #happy", "", "null", "Learning Python 🐍", None, "Data science rocks!"]\n\n# Clean the data: remove empty/null entries\n# Convert to proper format for analysis\n',
    expectedOutput: 'Cleaned posts: 3 valid entries\nReady for visualization',
    workedExample: {
      problem: 'How do we systematically clean messy social media data?',
      solution: 'import pandas as pd\n\nposts = ["Great day! #happy", "", "null", "Learning Python 🐍", None, "Data science rocks!"]\n\n# Clean the data\ncleaned_posts = []\nfor post in posts:\n    if post and post.strip() and post.lower() != "null":\n        cleaned_posts.append(post.strip())\n\nprint(f"Cleaned posts: {len(cleaned_posts)} valid entries")\nprint("Ready for visualization")\nprint("Valid posts:", cleaned_posts)',
      explanation: 'This solution demonstrates a systematic approach to data cleaning by checking for multiple types of invalid data: None values, empty strings, whitespace-only strings, and explicit "null" strings.',
      keyLearningPoints: [
        'Always check for multiple types of missing/invalid data',
        'Use strip() to remove leading/trailing whitespace',
        'Consider case-insensitive checks for string comparisons',
        'Document your cleaning decisions for reproducibility'
      ]
    },
    topics: ['Data Cleaning', 'Lists', 'Pandas', 'Data Preprocessing'],
    isPublished: true,
  },
  {
    id: 'ex3c',
    courseId: 'bsds3003',
    title: 'Advanced Data Transformation',
    description: 'Apply advanced data transformation techniques to social media data.',
    difficulty: 'advanced',
    type: 'coding',
    prompt: 'Transform social media engagement data by creating new features, handling outliers, and normalizing values.',
    starterCode: 'import pandas as pd\nimport numpy as np\nfrom sklearn.preprocessing import StandardScaler\n\n# Sample social media data\ndata = {\n    "user_id": range(1, 101),\n    "posts": np.random.poisson(5, 100),\n    "likes": np.random.exponential(50, 100),\n    "shares": np.random.poisson(2, 100),\n    "followers": np.random.lognormal(6, 1, 100)\n}\n\ndf = pd.DataFrame(data)\n\n# Create engagement rate feature\n# Handle outliers using IQR method\n# Normalize features for analysis\n',
    expectedOutput: 'Created engagement_rate feature\nRemoved 5 outliers\nNormalized 4 features\nDataset ready for analysis',
    topics: ['Feature Engineering', 'Outlier Detection', 'Data Normalization', 'Advanced Preprocessing'],
    isPublished: true,
  },
  {
    id: 'ex3d',
    courseId: 'bsds3003',
    title: 'Interactive Dashboard Design',
    description: 'Design principles for effective data dashboards.',
    difficulty: 'intermediate',
    type: 'multiple-choice',
    prompt: 'When designing a dashboard for social media analytics, what should be the primary consideration?',
    options: [
      'Including as many charts as possible',
      'Using the most advanced visualization techniques',
      'Focusing on the key metrics that drive decisions',
      'Making all data equally prominent'
    ],
    correctAnswer: 2,
    topics: ['Dashboard Design', 'User Experience', 'Data Visualization', 'Decision Making'],
    isPublished: true,
  },
  {
    id: 'ex3e',
    courseId: 'bsds3003',
    title: 'Geospatial Data Visualization',
    description: 'Create maps showing geographic patterns in social data.',
    difficulty: 'advanced',
    type: 'coding',
    prompt: 'Create a choropleth map showing social media usage patterns across different regions.',
    starterCode: 'import pandas as pd\nimport plotly.express as px\n\n# Sample regional social media data\nregional_data = {\n    "region": ["North", "South", "East", "West", "Central"],\n    "users": [1200, 800, 1500, 900, 1100],\n    "engagement_rate": [0.045, 0.038, 0.052, 0.041, 0.047]\n}\n\ndf = pd.DataFrame(regional_data)\n\n# Create choropleth map\n# Color regions by engagement rate\n# Add hover information\n',
    expectedOutput: 'Interactive choropleth map created\nShowing engagement rates by region\nHover shows detailed statistics',
    topics: ['Geospatial Visualization', 'Choropleth Maps', 'Interactive Plots', 'Regional Analysis'],
    isPublished: true,
  },
  {
    id: 'ex3f',
    courseId: 'bsds3003',
    title: 'Time Series Visualization Principles',
    description: 'Best practices for visualizing temporal data.',
    difficulty: 'intermediate',
    type: 'short-answer',
    prompt: 'You need to visualize daily social media engagement over a year, showing both trends and seasonal patterns. Describe three different visualization approaches and explain when each would be most appropriate.',
    correctAnswer: '1) Line plot: Best for showing overall trends and patterns over time. 2) Heatmap calendar: Excellent for showing seasonal patterns and identifying specific high/low engagement days. 3) Decomposition plot: Ideal for separating trend, seasonal, and residual components for detailed analysis.',
    topics: ['Time Series Visualization', 'Temporal Patterns', 'Chart Selection', 'Seasonal Analysis'],
    isPublished: true,
  },
  {
    id: 'ex3g',
    courseId: 'bsds3003',
    title: 'Network Visualization Design',
    description: 'Create effective visualizations of social network data.',
    difficulty: 'advanced',
    type: 'coding',
    prompt: 'Create a network visualization that shows community structure and node importance in a social network.',
    starterCode: 'import networkx as nx\nimport matplotlib.pyplot as plt\nimport numpy as np\n\n# Create sample social network\nG = nx.karate_club_graph()\n\n# Detect communities\ncommunities = nx.community.greedy_modularity_communities(G)\n\n# Calculate centrality measures\ncentrality = nx.degree_centrality(G)\n\n# Create visualization with:\n# - Different colors for communities\n# - Node sizes based on centrality\n# - Clear layout\n',
    expectedOutput: 'Network visualization created\nCommunities shown in different colors\nNode sizes reflect importance\nClear, readable layout',
    topics: ['Network Visualization', 'Community Detection', 'Graph Layout', 'Visual Design'],
    isPublished: true,
  },
  {
    id: 'ex3h',
    courseId: 'bsds3003',
    title: 'Data Pipeline Architecture',
    description: 'Design a robust data processing pipeline.',
    difficulty: 'advanced',
    type: 'essay',
    prompt: 'Design a data processing pipeline for analyzing real-time social media data. Your pipeline should handle data ingestion, cleaning, transformation, and storage. Address scalability, error handling, and monitoring. Include specific technologies and explain your architectural choices. (500-600 words)',
    sampleAnswer: 'Real-time Social Media Data Pipeline Architecture\n\n1. Data Ingestion Layer:\nUtilize Apache Kafka for high-throughput message streaming...',
    topics: ['Data Pipeline', 'Real-time Processing', 'System Architecture', 'Scalability'],
    isPublished: true,
  },
  {
    id: 'ex3i',
    courseId: 'bsds3003',
    title: 'Visualization Accessibility',
    description: 'Ensure visualizations are accessible to all users.',
    difficulty: 'intermediate',
    type: 'multiple-choice',
    prompt: 'Which design choice best improves accessibility in data visualizations?',
    options: [
      'Using only bright, saturated colors',
      'Including patterns or textures in addition to color coding',
      'Making all text as small as possible to fit more information',
      'Using complex 3D effects for visual appeal'
    ],
    correctAnswer: 1,
    topics: ['Accessibility', 'Inclusive Design', 'Color Theory', 'Visual Design'],
    isPublished: true,
  },
  {
    id: 'ex3j',
    courseId: 'bsds3003',
    title: 'Performance Optimization',
    description: 'Optimize data processing and visualization performance.',
    difficulty: 'advanced',
    type: 'coding',
    prompt: 'Optimize a slow data processing script that analyzes large social media datasets.',
    starterCode: '# Slow implementation\nimport pandas as pd\nimport numpy as np\n\ndef slow_analysis(df):\n    """Inefficient analysis of social media data"""\n    results = []\n    for index, row in df.iterrows():\n        engagement = row["likes"] + row["shares"] + row["comments"]\n        if engagement > 100:\n            results.append({\n                "user": row["username"],\n                "engagement": engagement,\n                "rate": engagement / row["followers"]\n            })\n    return results\n\n# Optimize this function for better performance\n# Use vectorized operations and efficient pandas methods\n',
    expectedOutput: 'Optimized function runs 50x faster\nUsing vectorized operations\nMemory usage reduced by 60%',
    topics: ['Performance Optimization', 'Vectorization', 'Memory Management', 'Efficient Computing'],
    isPublished: true,
  },
  {
    id: 'ex3b',
    courseId: 'bsds3003',
    title: 'Data Visualization Best Practices',
    description: 'Identify appropriate visualization types for different data scenarios.',
    difficulty: 'intermediate',
    type: 'multiple-choice',
    prompt: 'You have a dataset showing the relationship between social media usage hours per day and reported happiness levels (1-10 scale) for 1000 participants. Which visualization would be most appropriate to explore this relationship?',
    options: [
      'Bar chart showing average happiness for each usage hour',
      'Scatter plot with usage hours on x-axis and happiness on y-axis',
      'Pie chart showing distribution of happiness levels',
      'Line chart connecting happiness levels over time'
    ],
    correctAnswer: 1,
    topics: ['Data Visualization', 'Chart Selection', 'Correlation Analysis'],
    isPublished: true,
  },
  {
    id: 'ex4a',
    courseId: 'bsds3003',
    title: 'Interactive Data Visualization',
    description: 'Create compelling visualizations from social data using pandas and plotting libraries.',
    difficulty: 'advanced',
    type: 'coding',
    prompt: 'Create an interactive visualization showing social media engagement trends. Use pandas to process the data and create meaningful charts.',
    starterCode: 'import pandas as pd\nimport matplotlib.pyplot as plt\n\n# Social media engagement data\nengagement_data = {\n    "platform": ["Twitter", "Instagram", "TikTok", "LinkedIn"],\n    "users": [450, 320, 280, 150],\n    "engagement_rate": [3.2, 5.8, 8.1, 2.1]\n}\n\ndf = pd.DataFrame(engagement_data)\n\n# Create visualization\n',
    workedExample: {
      problem: 'How do we create effective visualizations for social media engagement data?',
      solution: 'import pandas as pd\nimport matplotlib.pyplot as plt\n\nengagement_data = {\n    "platform": ["Twitter", "Instagram", "TikTok", "LinkedIn"],\n    "users": [450, 320, 280, 150],\n    "engagement_rate": [3.2, 5.8, 8.1, 2.1]\n}\n\ndf = pd.DataFrame(engagement_data)\n\n# Create subplot with two charts\nfig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5))\n\n# Bar chart for user counts\nax1.bar(df["platform"], df["users"], color=["#1DA1F2", "#E4405F", "#000000", "#0077B5"])\nax1.set_title("Users by Platform")\nax1.set_ylabel("Number of Users")\n\n# Scatter plot for engagement rate\nax2.scatter(df["users"], df["engagement_rate"], s=100, alpha=0.7)\nfor i, platform in enumerate(df["platform"]):\n    ax2.annotate(platform, (df["users"][i], df["engagement_rate"][i]))\nax2.set_title("Users vs Engagement Rate")\nax2.set_xlabel("Number of Users")\nax2.set_ylabel("Engagement Rate (%)")\n\nplt.tight_layout()\nplt.show()',
      explanation: 'This solution creates a comprehensive visualization using subplots to show both the scale of each platform and the relationship between user base and engagement.',
      keyLearningPoints: [
        'Use subplots to show multiple perspectives of the same data',
        'Choose colors that match platform branding for better recognition',
        'Add annotations to scatter plots for clarity',
        'Consider the story you want to tell with your visualization'
      ]
    },
    topics: ['Data Visualization', 'Pandas', 'Matplotlib', 'Social Media Analytics'],
    isPublished: true,
  },
  {
    // BSDS3004 - Introduction to Statistics
    id: 'ex5a',
    courseId: 'bsds3004',
    title: 'Statistical Analysis of Social Data',
    description: 'Apply statistical methods to analyze patterns in social data and draw meaningful conclusions.',
    difficulty: 'advanced',
    type: 'coding',
    prompt: 'Perform statistical analysis on user behavior data. Calculate descriptive statistics, identify correlations, and test hypotheses about user engagement patterns.',
    starterCode: 'import pandas as pd\nimport numpy as np\nfrom scipy import stats\n\n# User behavior dataset\nuser_data = {\n    "user_id": range(1, 101),\n    "daily_posts": np.random.poisson(2, 100),\n    "engagement_score": np.random.normal(50, 15, 100),\n    "time_spent": np.random.exponential(30, 100)\n}\n\ndf = pd.DataFrame(user_data)\n\n# Perform statistical analysis\n',
    workedExample: {
      problem: 'How do we conduct comprehensive statistical analysis of social media user behavior?',
      solution: 'import pandas as pd\nimport numpy as np\nfrom scipy import stats\n\nuser_data = {\n    "user_id": range(1, 101),\n    "daily_posts": np.random.poisson(2, 100),\n    "engagement_score": np.random.normal(50, 15, 100),\n    "time_spent": np.random.exponential(30, 100)\n}\n\ndf = pd.DataFrame(user_data)\n\n# Descriptive statistics\nprint("Descriptive Statistics:")\nprint(df.describe())\n\n# Correlation analysis\nprint("\\nCorrelation Matrix:")\nprint(df.corr())\n\n# Hypothesis test: Do users who post more have higher engagement?\ncorr_coef, p_value = stats.pearsonr(df["daily_posts"], df["engagement_score"])\nprint(f"\\nCorrelation between posts and engagement: {corr_coef:.3f}")\nprint(f"P-value: {p_value:.3f}")\n\nif p_value < 0.05:\n    print("Significant correlation found!")\nelse:\n    print("No significant correlation found.")',
      explanation: 'This solution demonstrates a systematic approach to statistical analysis, starting with descriptive statistics, then exploring relationships, and finally testing specific hypotheses.',
      keyLearningPoints: [
        'Always start with descriptive statistics to understand your data',
        'Use correlation analysis to identify potential relationships',
        'Apply appropriate statistical tests based on your research questions',
        'Interpret p-values correctly in the context of your analysis'
      ]
    },
    topics: ['Statistics', 'Hypothesis Testing', 'Correlation Analysis', 'Data Science'],
    isPublished: true,
  },
  {
    id: 'ex4c',
    courseId: 'bsds3004',
    title: 'Probability Distributions in Social Data',
    description: 'Identify and work with probability distributions in social media data.',
    difficulty: 'intermediate',
    type: 'coding',
    prompt: 'Analyze the distribution of social media post frequencies and fit appropriate probability distributions.',
    starterCode: 'import numpy as np\nimport matplotlib.pyplot as plt\nfrom scipy import stats\n\n# Generate sample data: daily post counts\nnp.random.seed(42)\npost_counts = np.random.poisson(3, 1000)  # Poisson distribution\n\n# Analyze the distribution\n# Fit different probability distributions\n# Compare goodness of fit\n',
    expectedOutput: 'Best fit: Poisson distribution\nParameter estimate: λ = 2.98\nGoodness of fit: p-value = 0.23',
    topics: ['Probability Distributions', 'Distribution Fitting', 'Goodness of Fit', 'Social Media Analytics'],
    isPublished: true,
  },
  {
    id: 'ex4d',
    courseId: 'bsds3004',
    title: 'A/B Testing for Social Platforms',
    description: 'Design and analyze A/B tests for social media features.',
    difficulty: 'advanced',
    type: 'coding',
    prompt: 'Analyze the results of an A/B test comparing two different social media interface designs.',
    starterCode: 'import numpy as np\nfrom scipy import stats\nimport pandas as pd\n\n# A/B test data: engagement rates\nnp.random.seed(42)\ncontrol_group = np.random.normal(0.05, 0.02, 1000)  # 5% engagement rate\ntreatment_group = np.random.normal(0.055, 0.02, 1000)  # 5.5% engagement rate\n\n# Perform statistical test\n# Calculate effect size\n# Determine practical significance\n',
    expectedOutput: 'A/B Test Results:\nControl: 5.0% engagement\nTreatment: 5.5% engagement\nP-value: 0.001 (significant)\nEffect size: 0.25 (small to medium)',
    topics: ['A/B Testing', 'Statistical Significance', 'Effect Size', 'Experimental Design'],
    isPublished: true,
  },
  {
    id: 'ex4e',
    courseId: 'bsds3004',
    title: 'Regression Analysis for Social Behavior',
    description: 'Use regression to model relationships in social data.',
    difficulty: 'advanced',
    type: 'coding',
    prompt: 'Build a multiple regression model to predict social media engagement based on user characteristics.',
    starterCode: 'import pandas as pd\nimport numpy as np\nfrom sklearn.linear_model import LinearRegression\nfrom sklearn.metrics import r2_score\nimport statsmodels.api as sm\n\n# Generate sample data\nnp.random.seed(42)\nn_users = 500\n\ndata = {\n    "followers": np.random.lognormal(6, 1, n_users),\n    "posts_per_day": np.random.poisson(2, n_users),\n    "account_age": np.random.uniform(30, 2000, n_users),  # days\n    "is_verified": np.random.binomial(1, 0.1, n_users)\n}\n\n# Create engagement as dependent variable\nengagement = (0.001 * data["followers"] + \n             5 * data["posts_per_day"] + \n             0.01 * data["account_age"] + \n             20 * data["is_verified"] + \n             np.random.normal(0, 10, n_users))\n\ndf = pd.DataFrame(data)\ndf["engagement"] = engagement\n\n# Build and evaluate regression model\n',
    expectedOutput: 'Multiple Regression Results:\nR-squared: 0.78\nFollowers coefficient: 0.001 (p < 0.001)\nPosts coefficient: 5.2 (p < 0.001)\nModel explains 78% of engagement variance',
    topics: ['Multiple Regression', 'Model Building', 'Statistical Modeling', 'Predictive Analytics'],
    isPublished: true,
  },
  {
    id: 'ex4f',
    courseId: 'bsds3004',
    title: 'Survey Data Analysis',
    description: 'Analyze survey data about social media usage patterns.',
    difficulty: 'intermediate',
    type: 'multiple-choice',
    prompt: 'In a survey about social media usage, you want to test if there\'s a relationship between age group and preferred platform. Which statistical test is most appropriate?',
    options: [
      'Independent t-test',
      'Chi-square test of independence',
      'One-way ANOVA',
      'Pearson correlation'
    ],
    correctAnswer: 1,
    topics: ['Chi-square Test', 'Categorical Data', 'Survey Analysis', 'Statistical Test Selection'],
    isPublished: true,
  },
  {
    id: 'ex4g',
    courseId: 'bsds3004',
    title: 'Time Series Analysis of Social Trends',
    description: 'Analyze temporal patterns in social media data.',
    difficulty: 'advanced',
    type: 'coding',
    prompt: 'Analyze time series data of hashtag usage to identify trends and seasonal patterns.',
    starterCode: 'import pandas as pd\nimport numpy as np\nimport matplotlib.pyplot as plt\nfrom statsmodels.tsa.seasonal import seasonal_decompose\nfrom statsmodels.tsa.stattools import adfuller\n\n# Generate sample hashtag usage data\nnp.random.seed(42)\ndates = pd.date_range("2020-01-01", "2023-12-31", freq="D")\ntrend = np.linspace(100, 200, len(dates))\nseasonal = 50 * np.sin(2 * np.pi * np.arange(len(dates)) / 365.25)\nnoise = np.random.normal(0, 20, len(dates))\nhashtag_usage = trend + seasonal + noise\n\ndf = pd.DataFrame({"date": dates, "usage": hashtag_usage})\ndf.set_index("date", inplace=True)\n\n# Perform time series analysis\n# Decompose into trend, seasonal, and residual components\n# Test for stationarity\n',
    expectedOutput: 'Time Series Analysis Results:\nTrend: Increasing (100 to 200)\nSeasonality: Annual pattern detected\nStationarity test: p-value = 0.001 (non-stationary)',
    topics: ['Time Series Analysis', 'Trend Analysis', 'Seasonality', 'Stationarity Testing'],
    isPublished: true,
  },
  {
    id: 'ex4h',
    courseId: 'bsds3004',
    title: 'Statistical Power Analysis',
    description: 'Calculate statistical power for social media experiments.',
    difficulty: 'intermediate',
    type: 'short-answer',
    prompt: 'You\'re planning an experiment to test if a new social media algorithm increases user engagement. The current engagement rate is 5%, and you want to detect a 1% increase. With α = 0.05 and desired power = 0.80, approximately how many users do you need in each group?',
    correctAnswer: 'Using power analysis for two proportions: n ≈ 3,800 users per group. This calculation considers the baseline rate (5%), effect size (1% increase), significance level (0.05), and desired power (0.80).',
    topics: ['Power Analysis', 'Sample Size Calculation', 'Experimental Design', 'Effect Size'],
    isPublished: true,
  },
  {
    id: 'ex4i',
    courseId: 'bsds3004',
    title: 'Bayesian Analysis of Social Data',
    description: 'Apply Bayesian methods to social media analytics.',
    difficulty: 'advanced',
    type: 'essay',
    prompt: 'Compare Bayesian and frequentist approaches to analyzing social media data. Discuss the advantages and disadvantages of each approach, provide examples of when each might be preferred, and explain how Bayesian methods can incorporate prior knowledge about user behavior. (400-500 words)',
    sampleAnswer: 'Bayesian vs. Frequentist Approaches in Social Media Analytics\n\nThe choice between Bayesian and frequentist statistical approaches significantly impacts how we analyze and interpret social media data...',
    topics: ['Bayesian Statistics', 'Frequentist Statistics', 'Statistical Philosophy', 'Prior Knowledge'],
    isPublished: true,
  },
  {
    id: 'ex4j',
    courseId: 'bsds3004',
    title: 'Meta-Analysis of Social Media Studies',
    description: 'Conduct meta-analysis of multiple social media research studies.',
    difficulty: 'advanced',
    type: 'coding',
    prompt: 'Perform a meta-analysis combining results from multiple studies on social media and mental health.',
    starterCode: 'import numpy as np\nimport pandas as pd\nfrom scipy import stats\nimport matplotlib.pyplot as plt\n\n# Sample data from multiple studies\nstudies_data = {\n    "study": ["Study A", "Study B", "Study C", "Study D", "Study E"],\n    "effect_size": [0.15, 0.22, 0.08, 0.31, 0.18],\n    "standard_error": [0.05, 0.08, 0.04, 0.12, 0.06],\n    "sample_size": [200, 150, 300, 100, 250]\n}\n\ndf = pd.DataFrame(studies_data)\n\n# Calculate weights (inverse variance)\n# Compute pooled effect size\n# Test for heterogeneity\n# Create forest plot\n',
    expectedOutput: 'Meta-Analysis Results:\nPooled effect size: 0.18 (95% CI: 0.12-0.24)\nHeterogeneity: I² = 45% (moderate)\nOverall effect: p < 0.001 (significant)',
    topics: ['Meta-Analysis', 'Effect Size Pooling', 'Heterogeneity', 'Evidence Synthesis'],
    isPublished: true,
  },
  {
    id: 'ex5b',
    courseId: 'bsds3004',
    title: 'Statistical Concepts Quiz',
    description: 'Test your understanding of fundamental statistical concepts.',
    difficulty: 'intermediate',
    type: 'multiple-choice',
    prompt: 'In a study of social media usage, you find a p-value of 0.03 when testing whether there\'s a difference in engagement between two platforms. What can you conclude?',
    options: [
      'There is a 3% chance that the null hypothesis is true',
      'There is a 97% chance that the alternative hypothesis is true',
      'If the null hypothesis were true, there would be a 3% chance of observing this result or more extreme',
      'The effect size is small because the p-value is small'
    ],
    correctAnswer: 2,
    topics: ['P-values', 'Hypothesis Testing', 'Statistical Inference'],
    isPublished: true,
  },
  {
    id: 'ex5c',
    courseId: 'bsds3004',
    title: 'Research Design Analysis',
    description: 'Analyze and critique a research design for studying social media behavior.',
    difficulty: 'advanced',
    type: 'essay',
    prompt: 'A researcher wants to study whether social media usage affects mental health. They plan to survey 100 university students about their daily social media usage and administer a standardized depression scale. Critically evaluate this research design, identifying potential confounding variables, limitations, and suggestions for improvement. (400-600 words)',
    sampleAnswer: 'This research design has several strengths but also significant limitations that need to be addressed. The use of a standardized depression scale is appropriate, but the cross-sectional design limits causal inference...',
    topics: ['Research Design', 'Confounding Variables', 'Causal Inference', 'Mental Health Research'],
    isPublished: true,
  },
  // Additional exercises for comprehensive coverage
  {
    id: 'ex6a',
    courseId: 'bsds3001',
    title: 'Responsible AI Usage in Programming',
    description: 'Learn how to use AI tools responsibly while maintaining deep learning and problem-solving skills.',
    difficulty: 'beginner',
    type: 'coding',
    prompt: 'Practice using AI assistance appropriately. Write a function that processes user data, but focus on understanding each step rather than just getting the answer.',
    starterCode: '# Responsible AI usage exercise\n# Goal: Learn the process, not just complete the task\n# Use AI for guidance, not direct solutions\n\ndef process_user_data(users):\n    """\n    Process a list of user dictionaries\n    Think through each step before asking for help\n    """\n    # Step 1: What do we need to do?\n    # Step 2: How should we approach this?\n    # Step 3: What are the edge cases?\n    \n    pass\n\n# Test data\nusers = [{"name": "Alice", "age": 25}, {"name": "Bob", "age": 30}]\n',
    workedExample: {
      problem: 'How do we balance AI assistance with independent learning?',
      solution: 'def process_user_data(users):\n    """\n    Process a list of user dictionaries\n    Focus on understanding each step\n    """\n    # Step 1: Validate input\n    if not users or not isinstance(users, list):\n        return []\n    \n    # Step 2: Process each user\n    processed_users = []\n    for user in users:\n        if isinstance(user, dict) and "name" in user and "age" in user:\n            # Step 3: Create processed entry\n            processed_user = {\n                "name": user["name"].title(),\n                "age": user["age"],\n                "age_group": "young" if user["age"] < 30 else "mature"\n            }\n            processed_users.append(processed_user)\n    \n    return processed_users\n\n# Test the function\nusers = [{"name": "alice", "age": 25}, {"name": "bob", "age": 30}]\nresult = process_user_data(users)\nprint("Processed users:", result)',
      explanation: 'This solution demonstrates thoughtful programming by breaking down the problem into clear steps, handling edge cases, and adding meaningful enhancements to the data.',
      keyLearningPoints: [
        'Break complex problems into smaller, manageable steps',
        'Always validate your inputs before processing',
        'Think about edge cases and error handling',
        'Use AI for guidance on approach, not for complete solutions'
      ]
    },
    topics: ['AI Ethics', 'Problem Solving', 'Functions', 'Critical Thinking'],
    isPublished: true,
  },
];

export const mockReflections: Reflection[] = [
  {
    id: 'r1',
    studentId: 'student1',
    exerciseId: 'ex1',
    content: 'This exercise helped me understand the importance of variable naming and data types. I initially struggled with understanding the difference between strings and integers.',
    timestamp: new Date('2025-01-08T10:30:00'),
    questions: {
      difficulties: 'I had trouble remembering to put quotes around strings and understanding why Python cares about data types.',
      genaiAssistance: 'The AI tutor helped me by asking guiding questions instead of giving direct answers. This made me think through the problem step by step.',
      improvements: 'Next time I would read the problem more carefully and test my code more frequently to catch errors early.',
    },
  },
  {
    id: 'r2',
    studentId: 'student1',
    exerciseId: 'ex2',
    content: 'Conditional statements are more intuitive than I expected. The logic flows naturally once you understand the structure.',
    timestamp: new Date('2025-01-07T14:15:00'),
    questions: {
      difficulties: 'I initially forgot about the colon after the if statement and had indentation issues.',
      genaiAssistance: 'The AI helped me debug my syntax errors by pointing me toward the right direction without solving it for me.',
      improvements: 'I need to pay more attention to Python syntax rules, especially indentation.',
    },
  },
  {
    id: 'r3',
    studentId: 'student2',
    exerciseId: 'ex1',
    content: 'Variables are fundamental to programming. I found the concept straightforward but needed practice with different data types.',
    timestamp: new Date('2025-01-08T09:15:00'),
    questions: {
      difficulties: 'Understanding when to use different data types and remembering syntax for string formatting.',
      genaiAssistance: 'The AI tutor provided helpful examples and guided me through debugging without giving away answers.',
      improvements: 'I should practice more with different data types and read documentation more carefully.',
    },
  },
  {
    id: 'r4',
    studentId: 'student3',
    exerciseId: 'ex3',
    content: 'List operations are powerful but can be confusing. The exercise helped me understand indexing and methods.',
    timestamp: new Date('2025-01-06T16:45:00'),
    questions: {
      difficulties: 'List indexing and understanding the difference between methods that modify lists vs. return new values.',
      genaiAssistance: 'AI helped clarify concepts through questions and examples, promoting deeper understanding.',
      improvements: 'More practice with list comprehensions and understanding when to use different list methods.',
    },
  },
];

export const mockPromptLogs: PromptLog[] = [
  {
    id: 'p1',
    studentId: 'student1',
    exerciseId: 'ex1',
    prompt: 'I\'m getting a syntax error when I try to print my variables. What am I doing wrong?',
    response: 'Syntax errors often come from missing quotes, parentheses, or colons. Can you show me the specific line that\'s causing the error? Also, check if you have the right indentation.',
    timestamp: new Date('2025-01-08T10:15:00'),
  },
  {
    id: 'p2',
    studentId: 'student1',
    exerciseId: 'ex1',
    prompt: 'How do I know if something should be a string or a number?',
    response: 'Great question! Think about how you plan to use the data. Will you do math with it? If yes, it\'s probably a number. Will you display it as text or combine it with other text? Then it\'s likely a string. What kind of data are you working with?',
    timestamp: new Date('2025-01-08T10:20:00'),
  },
  {
    id: 'p3',
    studentId: 'student1',
    exerciseId: 'ex2',
    prompt: 'My if statement isn\'t working. It always goes to the else clause.',
    response: 'Let\'s debug this step by step. First, can you tell me what condition you\'re checking? Then, what value is your variable when you test it? Sometimes the issue is with the condition logic or the test data.',
    timestamp: new Date('2025-01-07T14:00:00'),
  },
  {
    id: 'p4',
    studentId: 'student2',
    exerciseId: 'ex1',
    prompt: 'What\'s the difference between int and str in Python?',
    response: 'Excellent question! int represents whole numbers (like 42), while str represents text (like "hello"). You can do math with int but not with str. However, you can convert between them using int() and str() functions. What specific situation are you working with?',
    timestamp: new Date('2025-01-08T09:10:00'),
  },
  {
    id: 'p5',
    studentId: 'student3',
    exerciseId: 'ex3',
    prompt: 'How do I add an item to a list?',
    response: 'There are several ways to add items to a list! The most common is using the append() method. For example: my_list.append(new_item). Can you try this with your list and let me know what happens?',
    timestamp: new Date('2025-01-06T16:30:00'),
  },
];

export const mockStudentProgress: StudentProgress = {
  studentId: 'student1',
  exercisesCompleted: 3,
  hintsUsed: 8,
  averageScore: 87.5,
  lastActivity: new Date('2025-01-08T10:30:00'),
};

export const mockAllStudentProgress: Record<string, StudentProgress> = {
  student1: {
    studentId: 'student1',
    exercisesCompleted: 3,
    hintsUsed: 8,
    averageScore: 87.5,
    lastActivity: new Date('2025-01-08T10:30:00'),
  },
  student2: {
    studentId: 'student2',
    exercisesCompleted: 2,
    hintsUsed: 5,
    averageScore: 92.0,
    lastActivity: new Date('2025-01-08T09:15:00'),
  },
  student3: {
    studentId: 'student3',
    exercisesCompleted: 4,
    hintsUsed: 12,
    averageScore: 78.5,
    lastActivity: new Date('2025-01-06T16:45:00'),
  },
  student4: {
    studentId: 'student4',
    exercisesCompleted: 1,
    hintsUsed: 3,
    averageScore: 95.0,
    lastActivity: new Date('2025-01-09T11:20:00'),
  },
  student5: {
    studentId: 'student5',
    exercisesCompleted: 5,
    hintsUsed: 15,
    averageScore: 82.3,
    lastActivity: new Date('2025-01-05T14:30:00'),
  },
};

export const mockAllStudents = [
  {
    id: 'student1',
    name: 'Alex Chen',
    email: 'alex.chen@university.edu',
    role: 'student' as const,
  },
  {
    id: 'student2',
    name: 'Maria Rodriguez',
    email: 'maria.rodriguez@university.edu',
    role: 'student' as const,
  },
  {
    id: 'student3',
    name: 'James Wilson',
    email: 'james.wilson@university.edu',
    role: 'student' as const,
  },
  {
    id: 'student4',
    name: 'Emily Zhang',
    email: 'emily.zhang@university.edu',
    role: 'student' as const,
  },
  {
    id: 'student5',
    name: 'David Thompson',
    email: 'david.thompson@university.edu',
    role: 'student' as const,
  },
];

export const mockClassAnalytics = {
  totalStudents: 5,
  activeStudents: 4,
  averageCompletion: 75.2,
  commonErrors: [
    'SyntaxError: Missing colon after if statement',
    'IndentationError: Expected an indented block',
    'NameError: Variable not defined before use',
    'TypeError: Cannot concatenate string and integer',
  ],
  frequentQuestions: [
    'How do I fix indentation errors?',
    'What\'s the difference between = and ==?',
    'How do I convert between data types?',
    'Why am I getting a NameError?',
  ],
  genaiUsageStats: {
    totalPrompts: 156,
    averagePromptsPerStudent: 31,
    mostCommonPromptTypes: [
      'Syntax error help',
      'Concept clarification',
      'Debugging assistance',
      'Best practices',
    ],
  },
};
export const mockCurrentUser = {
  id: 'student1',
  name: 'Alex Chen',
  email: 'alex.chen@university.edu',
  role: 'student' as const,
};

export const mockCourseModules: CourseModule[] = [
  // BSDS3001 Modules
  {
    id: 'mod1-1',
    courseId: 'bsds3001',
    title: 'Introduction to Social Data Science',
    description: 'Overview of social data science, ethical considerations, and Python fundamentals',
    order: 1,
    topics: ['Social Data Science Overview', 'Ethics in Data Collection', 'Python Basics', 'Data Types'],
    learningObjectives: [
      'Understand the scope and applications of social data science',
      'Identify ethical considerations in data collection and analysis',
      'Master basic Python programming concepts',
      'Apply ethical frameworks to data science projects'
    ],
    content: `Social Data Science represents the intersection of computational methods, statistical analysis, and social research. This emerging field combines traditional social science methodologies with modern data analytics to understand human behavior, social patterns, and societal trends at scale.

**What is Social Data Science?**
Social Data Science is an interdisciplinary field that uses computational methods to analyze social phenomena. It draws from sociology, psychology, computer science, and statistics to understand how people interact, communicate, and behave in digital and physical spaces.

**Key Applications:**
• Social media analysis and sentiment tracking
• Urban planning and smart city initiatives  
• Public health monitoring and intervention
• Political behavior and election prediction
• Economic trend analysis and market research

**Ethical Foundations:**
Ethics form the cornerstone of responsible social data science practice. We must consider:
- Privacy and consent in data collection
- Bias and fairness in algorithmic decision-making
- Transparency and accountability in research methods
- Social impact and potential harm of research findings

**Python Fundamentals for Social Data Science:**
Python serves as our primary tool for data analysis due to its simplicity, extensive libraries, and strong community support. Key concepts include:
- Variables and data types (strings, integers, floats, booleans)
- Data structures (lists, dictionaries, sets)
- Control flow (if statements, loops)
- Functions and modules for code organization`,
    keyPoints: [
      'Social Data Science combines computational methods with social research to understand human behavior at scale',
      'Ethical considerations must be integrated from the beginning of any social data science project',
      'Python provides powerful tools for data collection, analysis, and visualization in social research',
      'Understanding data types and structures is fundamental to effective programming and analysis',
      'Responsible data usage requires consideration of privacy, consent, and potential societal impact'
    ],
    practiceQuestions: [
      {
        question: 'Which of the following best describes the primary goal of Social Data Science?',
        options: [
          'To collect as much social media data as possible',
          'To use computational methods to understand social phenomena and human behavior',
          'To replace traditional social research methods entirely',
          'To develop new social media platforms'
        ],
        correctAnswer: 1,
        explanation: 'Social Data Science aims to use computational methods and large-scale data to understand social phenomena, complementing rather than replacing traditional social research methods.'
      },
      {
        question: 'What is the most important ethical consideration when collecting social media data for research?',
        options: [
          'Ensuring the data is publicly available',
          'Getting permission from the social media platform',
          'Obtaining informed consent and protecting user privacy',
          'Using the most advanced data collection tools'
        ],
        correctAnswer: 2,
        explanation: 'Informed consent and privacy protection are fundamental ethical requirements, even when data appears to be publicly available. Researchers must consider the expectations and rights of data subjects.'
      },
      {
        question: 'In Python, which data type would be most appropriate for storing a person\'s age?',
        options: [
          'String',
          'Integer',
          'Boolean',
          'List'
        ],
        correctAnswer: 1,
        explanation: 'Age is typically stored as an integer since it represents a whole number of years. This allows for mathematical operations like calculating age ranges or averages.'
      }
    ]
  },
  {
    id: 'mod1-2',
    courseId: 'bsds3001',
    title: 'Data Collection and Privacy',
    description: 'Methods for ethical data collection, privacy protection, and consent management',
    order: 2,
    topics: ['Data Collection Methods', 'Privacy by Design', 'Consent Management', 'GDPR Compliance'],
    learningObjectives: [
      'Design ethical data collection protocols',
      'Implement privacy protection measures',
      'Understand legal requirements for data handling',
      'Balance research needs with privacy rights'
    ],
    content: `Data collection in social data science requires careful balance between research objectives and ethical obligations. This module explores comprehensive approaches to ethical data collection, privacy protection, and regulatory compliance.

**Data Collection Methods:**
Modern social data science employs various collection methods, each with distinct ethical implications:

*API-based Collection:* Using official APIs from social platforms provides structured access while respecting platform terms of service. This method typically offers better data quality and clearer usage rights.

*Web Scraping:* Automated collection from public websites requires careful consideration of robots.txt files, rate limiting, and terms of service. Legal and ethical boundaries vary by jurisdiction and platform.

*Survey and Interview Data:* Traditional methods remain valuable for collecting contextual information and personal perspectives that complement digital trace data.

**Privacy by Design Principles:**
Privacy by Design integrates privacy considerations into every stage of system development:

1. **Proactive not Reactive:** Anticipate and prevent privacy invasions before they occur
2. **Privacy as the Default:** Maximum privacy protection without requiring action from the individual
3. **Data Minimization:** Collect only data that is necessary for the specific research purpose
4. **Transparency:** Ensure all stakeholders understand data practices and policies

**Consent Management:**
Informed consent goes beyond simple agreement checkboxes:
- Clear explanation of data usage in plain language
- Granular control over different types of data sharing
- Easy withdrawal mechanisms
- Regular consent renewal for long-term studies

**GDPR and Global Compliance:**
The General Data Protection Regulation (GDPR) sets global standards for data protection:
- Right to access personal data
- Right to rectification and erasure
- Data portability requirements
- Privacy impact assessments for high-risk processing`,
    keyPoints: [
      'Different data collection methods have varying ethical implications and legal requirements',
      'Privacy by Design principles should be integrated from the project planning stage',
      'Informed consent must be meaningful, granular, and easily withdrawable',
      'GDPR compliance requires understanding of individual rights and organizational obligations',
      'Data minimization reduces both privacy risks and analytical complexity'
    ],
    practiceQuestions: [
      {
        question: 'According to Privacy by Design principles, when should privacy protections be implemented?',
        options: [
          'After data collection is complete',
          'When users request privacy protection',
          'From the beginning of system design',
          'Only when required by law'
        ],
        correctAnswer: 2,
        explanation: 'Privacy by Design requires proactive integration of privacy protections from the earliest stages of system design, not as an afterthought or reactive measure.'
      },
      {
        question: 'What does "data minimization" mean in the context of ethical data collection?',
        options: [
          'Collecting data from the smallest possible sample size',
          'Using the least expensive data collection methods',
          'Collecting only the data necessary for the specific research purpose',
          'Minimizing the time spent on data collection'
        ],
        correctAnswer: 2,
        explanation: 'Data minimization means collecting only the data that is necessary and relevant for the specific research purpose, reducing privacy risks and focusing analysis on essential information.'
      }
    ]
  },
  {
    id: 'mod1-3',
    courseId: 'bsds3001',
    title: 'Python Programming Fundamentals',
    description: 'Core Python concepts for data science applications',
    order: 3,
    topics: ['Variables and Data Types', 'Control Structures', 'Functions', 'Error Handling'],
    learningObjectives: [
      'Master Python syntax and basic programming concepts',
      'Understand data types and their appropriate usage',
      'Write functions and handle errors effectively',
      'Apply programming concepts to social data problems'
    ],
    content: `Python programming forms the foundation of modern social data science. This module covers essential programming concepts that enable effective data analysis and research.

**Variables and Data Types:**
Understanding how to store and manipulate different types of data is crucial for any programming task.

**Control Structures:**
Conditional statements and loops allow programs to make decisions and repeat operations efficiently.

**Functions:**
Functions enable code reusability and organization, making complex programs manageable and maintainable.

**Error Handling:**
Proper error handling ensures robust programs that can gracefully handle unexpected situations.`,
    keyPoints: [
      'Variables store data that can be used throughout your program',
      'Different data types serve different purposes in data analysis',
      'Control structures enable decision-making and repetition in programs',
      'Functions promote code reusability and organization',
      'Error handling makes programs more robust and user-friendly'
    ],
    practiceQuestions: [
      {
        question: 'Which Python data type would be best for storing a list of survey responses?',
        options: ['String', 'Integer', 'List', 'Boolean'],
        correctAnswer: 2,
        explanation: 'A list is the most appropriate data type for storing multiple survey responses as it can hold multiple values in an ordered collection.'
      }
    ]
  },
  {
    id: 'mod1-4',
    courseId: 'bsds3001',
    title: 'Data Structures and File Handling',
    description: 'Working with complex data structures and file operations',
    order: 4,
    topics: ['Lists and Dictionaries', 'File I/O', 'CSV Processing', 'JSON Handling'],
    learningObjectives: [
      'Manipulate complex data structures effectively',
      'Read and write various file formats',
      'Process CSV and JSON data',
      'Handle real-world data formats'
    ],
    content: `Data structures and file handling are essential skills for working with real-world social data. This module covers the tools needed to manage and process various data formats commonly encountered in social research.`,
    keyPoints: [
      'Lists and dictionaries are fundamental data structures in Python',
      'File I/O operations enable data persistence and sharing',
      'CSV files are common in social science research',
      'JSON is widely used for web-based data exchange'
    ],
    practiceQuestions: [
      {
        question: 'What is the main advantage of using dictionaries over lists in Python?',
        options: [
          'Dictionaries are faster for all operations',
          'Dictionaries allow key-based access to values',
          'Dictionaries use less memory',
          'Dictionaries can only store strings'
        ],
        correctAnswer: 1,
        explanation: 'Dictionaries provide key-based access to values, making it easy to retrieve specific data without knowing its position.'
      }
    ]
  },
  {
    id: 'mod1-5',
    courseId: 'bsds3001',
    title: 'Introduction to Pandas',
    description: 'Data manipulation and analysis with Pandas library',
    order: 5,
    topics: ['DataFrames', 'Data Cleaning', 'Filtering', 'Grouping'],
    learningObjectives: [
      'Create and manipulate Pandas DataFrames',
      'Clean and preprocess data effectively',
      'Filter and select relevant data subsets',
      'Group and aggregate data for analysis'
    ],
    content: `Pandas is the cornerstone library for data manipulation in Python. This module introduces the fundamental concepts and operations needed to work with structured data in social science research.`,
    keyPoints: [
      'DataFrames provide a powerful structure for tabular data',
      'Data cleaning is essential for reliable analysis',
      'Filtering allows focus on relevant data subsets',
      'Grouping enables aggregate analysis across categories'
    ],
    practiceQuestions: [
      {
        question: 'What is a Pandas DataFrame?',
        options: [
          'A type of Python list',
          'A 2-dimensional labeled data structure',
          'A file format for storing data',
          'A visualization tool'
        ],
        correctAnswer: 1,
        explanation: 'A DataFrame is a 2-dimensional labeled data structure with columns that can be of different types, similar to a spreadsheet or SQL table.'
      }
    ]
  },
  {
    id: 'mod1-6',
    courseId: 'bsds3001',
    title: 'Web Scraping and APIs',
    description: 'Collecting data from web sources and APIs',
    order: 6,
    topics: ['HTTP Requests', 'BeautifulSoup', 'API Authentication', 'Rate Limiting'],
    learningObjectives: [
      'Understand web scraping principles and ethics',
      'Use APIs to collect structured data',
      'Handle authentication and rate limiting',
      'Apply ethical guidelines to data collection'
    ],
    content: `Web scraping and API usage are powerful methods for collecting social data. This module covers both technical implementation and ethical considerations for responsible data collection.`,
    keyPoints: [
      'Web scraping should respect robots.txt and terms of service',
      'APIs provide structured access to platform data',
      'Rate limiting prevents overwhelming servers',
      'Authentication ensures authorized access to data'
    ],
    practiceQuestions: [
      {
        question: 'What is the primary advantage of using APIs over web scraping?',
        options: [
          'APIs are always free to use',
          'APIs provide structured, reliable data access',
          'APIs don\'t require programming knowledge',
          'APIs work faster than web scraping'
        ],
        correctAnswer: 1,
        explanation: 'APIs provide structured, reliable access to data with clear usage terms and consistent formats, making them preferable to web scraping when available.'
      }
    ]
  },
  {
    id: 'mod1-7',
    courseId: 'bsds3001',
    title: 'Data Ethics and Bias',
    description: 'Understanding bias in data and algorithms',
    order: 7,
    topics: ['Algorithmic Bias', 'Fairness Metrics', 'Bias Detection', 'Mitigation Strategies'],
    learningObjectives: [
      'Identify sources of bias in data and algorithms',
      'Understand fairness metrics and their applications',
      'Implement bias detection techniques',
      'Apply mitigation strategies in practice'
    ],
    content: `Bias in data and algorithms can perpetuate and amplify social inequalities. This module explores how to identify, measure, and mitigate bias in social data science projects.`,
    keyPoints: [
      'Bias can enter at multiple stages of the data science pipeline',
      'Different fairness metrics capture different aspects of equity',
      'Bias detection requires systematic evaluation approaches',
      'Mitigation strategies must be tailored to specific contexts'
    ],
    practiceQuestions: [
      {
        question: 'Which of the following is NOT a common source of bias in machine learning?',
        options: [
          'Historical bias in training data',
          'Representation bias in sampling',
          'Measurement bias in data collection',
          'Random number generation'
        ],
        correctAnswer: 3,
        explanation: 'Random number generation, when properly implemented, should not introduce bias. The other options are all common sources of bias in machine learning systems.'
      }
    ]
  },
  {
    id: 'mod1-8',
    courseId: 'bsds3001',
    title: 'Research Design and Methodology',
    description: 'Designing robust social data science studies',
    order: 8,
    topics: ['Research Questions', 'Study Design', 'Sampling Methods', 'Validity'],
    learningObjectives: [
      'Formulate clear research questions',
      'Design appropriate study methodologies',
      'Select suitable sampling strategies',
      'Ensure validity and reliability'
    ],
    content: `Good research design is fundamental to producing reliable and meaningful results in social data science. This module covers the principles of designing robust empirical studies.`,
    keyPoints: [
      'Clear research questions guide all subsequent methodological decisions',
      'Study design must match research objectives and constraints',
      'Sampling methods affect the generalizability of findings',
      'Validity and reliability are essential for credible research'
    ],
    practiceQuestions: [
      {
        question: 'What is the difference between internal and external validity?',
        options: [
          'Internal validity is about measurement accuracy, external validity is about generalizability',
          'Internal validity is about causation, external validity is about correlation',
          'Internal validity is about sample size, external validity is about data quality',
          'There is no difference between them'
        ],
        correctAnswer: 0,
        explanation: 'Internal validity refers to the accuracy of conclusions within the study context, while external validity refers to the generalizability of findings to other contexts.'
      }
    ]
  },
  {
    id: 'mod1-9',
    courseId: 'bsds3001',
    title: 'Reproducible Research Practices',
    description: 'Ensuring reproducibility and transparency in research',
    order: 9,
    topics: ['Version Control', 'Documentation', 'Code Organization', 'Data Management'],
    learningObjectives: [
      'Implement version control for research projects',
      'Create comprehensive documentation',
      'Organize code for reproducibility',
      'Manage data throughout the research lifecycle'
    ],
    content: `Reproducible research practices are essential for scientific integrity and collaboration. This module covers tools and techniques for ensuring research transparency and reproducibility.`,
    keyPoints: [
      'Version control tracks changes and enables collaboration',
      'Good documentation makes research accessible to others',
      'Well-organized code is easier to understand and maintain',
      'Proper data management ensures long-term accessibility'
    ],
    practiceQuestions: [
      {
        question: 'What is the primary purpose of version control in research?',
        options: [
          'To make code run faster',
          'To track changes and enable collaboration',
          'To compress files for storage',
          'To automatically fix bugs'
        ],
        correctAnswer: 1,
        explanation: 'Version control systems like Git track changes over time and enable multiple researchers to collaborate effectively on the same project.'
      }
    ]
  },
  {
    id: 'mod1-10',
    courseId: 'bsds3001',
    title: 'Project Management and Communication',
    description: 'Managing social data science projects and communicating results',
    order: 10,
    topics: ['Project Planning', 'Team Collaboration', 'Result Communication', 'Stakeholder Engagement'],
    learningObjectives: [
      'Plan and manage data science projects effectively',
      'Collaborate efficiently in team environments',
      'Communicate results to diverse audiences',
      'Engage stakeholders throughout the project lifecycle'
    ],
    content: `Successful social data science projects require effective project management and communication skills. This module covers practical approaches to managing projects and communicating findings.`,
    keyPoints: [
      'Good project planning prevents common pitfalls and delays',
      'Team collaboration requires clear communication and defined roles',
      'Results must be communicated appropriately for different audiences',
      'Stakeholder engagement ensures project relevance and impact'
    ],
    practiceQuestions: [
      {
        question: 'When communicating data science results to non-technical stakeholders, what should be prioritized?',
        options: [
          'Technical details and methodology',
          'Statistical significance levels',
          'Clear insights and actionable recommendations',
          'Code implementation details'
        ],
        correctAnswer: 2,
        explanation: 'Non-technical stakeholders are primarily interested in clear insights and actionable recommendations rather than technical implementation details.'
      }
    ]
  },
  // Add more modules for other courses
  {
    id: 'mod2-1',
    courseId: 'bsds3002',
    title: 'Social Network Analysis Fundamentals',
    description: 'Introduction to social networks, graph theory, and network metrics',
    order: 1,
    topics: ['Graph Theory', 'Network Metrics', 'Centrality Measures', 'Community Detection'],
    learningObjectives: [
      'Understand basic graph theory concepts',
      'Calculate and interpret network metrics',
      'Identify influential nodes in networks',
      'Detect communities in social networks'
    ],
    content: `Social Network Analysis (SNA) provides powerful tools for understanding relationships, influence patterns, and information flow within social systems. This module introduces fundamental concepts and practical applications.

**Graph Theory Foundations:**
Social networks are mathematically represented as graphs consisting of:
- **Nodes (Vertices):** Individual actors in the network (people, organizations, etc.)
- **Edges (Links):** Relationships or connections between actors
- **Directed vs. Undirected:** Whether relationships have direction (following vs. friendship)
- **Weighted vs. Unweighted:** Whether connections have varying strengths

**Key Network Metrics:**

*Degree Centrality:* The number of direct connections a node has. High degree indicates local importance and potential influence.

*Betweenness Centrality:* Measures how often a node lies on the shortest path between other nodes. High betweenness indicates brokerage potential.

*Closeness Centrality:* How close a node is to all other nodes in the network. High closeness enables efficient information spread.

*Eigenvector Centrality:* Considers not just the number of connections, but the importance of those connections. Used in algorithms like PageRank.

**Community Detection:**
Communities are groups of nodes that are more densely connected internally than externally:
- **Modularity:** Measures the strength of community structure
- **Clustering Coefficient:** Local measure of how interconnected a node's neighbors are
- **Algorithms:** Louvain, Leiden, and other methods for identifying communities

**Applications in Social Data Science:**
- Identifying influential users in social media
- Understanding information diffusion patterns
- Detecting echo chambers and filter bubbles
- Analyzing organizational communication structures`,
    keyPoints: [
      'Social networks can be mathematically represented as graphs with nodes and edges',
      'Different centrality measures capture different aspects of node importance and influence',
      'Community detection helps identify cohesive groups within larger networks',
      'Network metrics provide quantitative measures for comparing and analyzing social structures',
      'Understanding network structure is crucial for predicting information flow and influence patterns'
    ],
    practiceQuestions: [
      {
        question: 'Which centrality measure would be most useful for identifying users who can bridge different communities in a social network?',
        options: [
          'Degree centrality',
          'Betweenness centrality',
          'Closeness centrality',
          'Eigenvector centrality'
        ],
        correctAnswer: 1,
        explanation: 'Betweenness centrality measures how often a node lies on the shortest paths between other nodes, making it ideal for identifying bridge nodes that connect different communities.'
      },
      {
        question: 'In a directed social network representing Twitter follows, what does an edge from Node A to Node B represent?',
        options: [
          'Node B follows Node A',
          'Node A follows Node B',
          'Node A and Node B follow each other',
          'Node A and Node B are mentioned together'
        ],
        correctAnswer: 1,
        explanation: 'In a directed network, an edge from A to B represents that A follows B, indicating the direction of the relationship or information flow.'
      }
    ]
  },
  {
    id: 'mod2-2',
    courseId: 'bsds3002',
    title: 'Online Communities and Digital Behavior',
    description: 'Analysis of online communities, digital behavior patterns, and social influence',
    order: 2,
    topics: ['Online Communities', 'Digital Behavior', 'Social Influence', 'Information Diffusion'],
    learningObjectives: [
      'Analyze online community structures',
      'Identify patterns in digital behavior',
      'Understand mechanisms of social influence',
      'Model information spread in networks'
    ],
    content: `Online communities represent new forms of social organization that emerge in digital spaces. This module explores how people form communities online and how behavior patterns differ from offline interactions.`,
    keyPoints: [
      'Online communities have unique characteristics compared to offline groups',
      'Digital behavior patterns can be analyzed through computational methods',
      'Social influence operates differently in online environments',
      'Information diffusion follows predictable patterns in digital networks'
    ],
    practiceQuestions: [
      {
        question: 'What is a key difference between online and offline communities?',
        options: [
          'Online communities are always larger',
          'Online communities can form around shared interests regardless of geography',
          'Online communities are less meaningful',
          'Online communities don\'t have social norms'
        ],
        correctAnswer: 1,
        explanation: 'Online communities can form around shared interests without geographical constraints, allowing people from different locations to connect over common topics.'
      }
    ]
  },
  {
    id: 'mod2-3',
    courseId: 'bsds3002',
    title: 'Social Media Analytics',
    description: 'Analyzing social media data for insights into human behavior',
    order: 3,
    topics: ['Content Analysis', 'Sentiment Analysis', 'Trend Detection', 'User Profiling'],
    learningObjectives: [
      'Perform content analysis on social media posts',
      'Implement sentiment analysis techniques',
      'Detect trends in social media data',
      'Create user profiles from digital traces'
    ],
    content: `Social media platforms generate vast amounts of data about human behavior and social interactions. This module covers techniques for extracting meaningful insights from social media data.`,
    keyPoints: [
      'Content analysis reveals patterns in communication',
      'Sentiment analysis helps understand public opinion',
      'Trend detection identifies emerging topics and behaviors',
      'User profiling enables personalization and targeting'
    ],
    practiceQuestions: [
      {
        question: 'What is the primary goal of sentiment analysis?',
        options: [
          'To count the number of posts',
          'To determine the emotional tone of text',
          'To identify user locations',
          'To measure network connectivity'
        ],
        correctAnswer: 1,
        explanation: 'Sentiment analysis aims to determine the emotional tone or attitude expressed in text, helping understand public opinion and reactions.'
      }
    ]
  },
  {
    id: 'mod2-4',
    courseId: 'bsds3002',
    title: 'Information Diffusion and Viral Phenomena',
    description: 'Understanding how information spreads through social networks',
    order: 4,
    topics: ['Diffusion Models', 'Viral Mechanics', 'Influence Maximization', 'Cascade Analysis'],
    learningObjectives: [
      'Model information diffusion processes',
      'Understand factors that make content viral',
      'Optimize influence maximization strategies',
      'Analyze information cascades'
    ],
    content: `Information diffusion is a fundamental process in social networks. This module explores how information, ideas, and behaviors spread through social connections.`,
    keyPoints: [
      'Diffusion models help predict information spread',
      'Viral content has specific characteristics that promote sharing',
      'Influence maximization identifies optimal seed nodes',
      'Cascade analysis reveals diffusion patterns'
    ],
    practiceQuestions: [
      {
        question: 'In the context of information diffusion, what is a "cascade"?',
        options: [
          'A waterfall visualization',
          'A sequence of information transmission events',
          'A type of network structure',
          'A machine learning algorithm'
        ],
        correctAnswer: 1,
        explanation: 'An information cascade is a sequence of transmission events where information spreads from one node to another through the network.'
      }
    ]
  },
  {
    id: 'mod2-5',
    courseId: 'bsds3002',
    title: 'Computational Social Choice',
    description: 'Applying computational methods to collective decision-making',
    order: 5,
    topics: ['Voting Systems', 'Preference Aggregation', 'Strategic Behavior', 'Fairness'],
    learningObjectives: [
      'Understand different voting systems and their properties',
      'Analyze preference aggregation mechanisms',
      'Identify strategic behavior in collective decisions',
      'Evaluate fairness in decision-making processes'
    ],
    content: `Computational social choice combines computer science with social choice theory to understand and improve collective decision-making processes.`,
    keyPoints: [
      'Different voting systems have different strengths and weaknesses',
      'Preference aggregation is a fundamental challenge in group decisions',
      'Strategic behavior can undermine collective decision quality',
      'Fairness criteria help evaluate decision-making mechanisms'
    ],
    practiceQuestions: [
      {
        question: 'What is Arrow\'s Impossibility Theorem about?',
        options: [
          'It\'s impossible to count votes accurately',
          'No voting system can satisfy all desirable properties simultaneously',
          'Computers cannot make decisions',
          'Social networks are too complex to analyze'
        ],
        correctAnswer: 1,
        explanation: 'Arrow\'s Impossibility Theorem proves that no voting system can simultaneously satisfy all seemingly reasonable fairness criteria.'
      }
    ]
  },
  {
    id: 'mod2-6',
    courseId: 'bsds3002',
    title: 'Crowdsourcing and Collective Intelligence',
    description: 'Harnessing collective intelligence through crowdsourcing platforms',
    order: 6,
    topics: ['Crowdsourcing Platforms', 'Quality Control', 'Incentive Design', 'Wisdom of Crowds'],
    learningObjectives: [
      'Design effective crowdsourcing systems',
      'Implement quality control mechanisms',
      'Create appropriate incentive structures',
      'Understand conditions for collective intelligence'
    ],
    content: `Crowdsourcing leverages the collective intelligence of large groups to solve problems and complete tasks. This module explores how to design and manage effective crowdsourcing systems.`,
    keyPoints: [
      'Crowdsourcing can solve problems that are difficult for individuals',
      'Quality control is essential for reliable crowdsourced results',
      'Proper incentives motivate high-quality contributions',
      'Collective intelligence emerges under specific conditions'
    ],
    practiceQuestions: [
      {
        question: 'What is a key challenge in crowdsourcing?',
        options: [
          'Finding enough participants',
          'Ensuring quality of contributions',
          'Setting up the technology platform',
          'Paying participants'
        ],
        correctAnswer: 1,
        explanation: 'Ensuring quality of contributions is a fundamental challenge in crowdsourcing, as participants may have varying levels of expertise and motivation.'
      }
    ]
  },
  {
    id: 'mod2-7',
    courseId: 'bsds3002',
    title: 'Digital Divide and Inequality',
    description: 'Examining digital inequalities and their social implications',
    order: 7,
    topics: ['Access Inequality', 'Usage Patterns', 'Digital Literacy', 'Policy Implications'],
    learningObjectives: [
      'Identify different dimensions of digital inequality',
      'Analyze usage patterns across demographic groups',
      'Understand the role of digital literacy',
      'Evaluate policy interventions'
    ],
    content: `The digital divide encompasses various forms of inequality in access to and use of digital technologies. This module examines these inequalities and their broader social implications.`,
    keyPoints: [
      'Digital inequality has multiple dimensions beyond simple access',
      'Usage patterns vary significantly across demographic groups',
      'Digital literacy affects the ability to benefit from technology',
      'Policy interventions can help address digital inequalities'
    ],
    practiceQuestions: [
      {
        question: 'Which of the following is NOT typically considered a dimension of the digital divide?',
        options: [
          'Access to devices and internet',
          'Digital skills and literacy',
          'Quality of internet connection',
          'Preference for offline activities'
        ],
        correctAnswer: 3,
        explanation: 'Preference for offline activities is a personal choice rather than a structural barrier that characterizes the digital divide.'
      }
    ]
  },
  {
    id: 'mod2-8',
    courseId: 'bsds3002',
    title: 'Algorithmic Governance and Platform Power',
    description: 'Understanding how algorithms shape social interactions and power dynamics',
    order: 8,
    topics: ['Platform Algorithms', 'Content Moderation', 'Recommendation Systems', 'Regulatory Responses'],
    learningObjectives: [
      'Analyze how platform algorithms influence behavior',
      'Understand content moderation challenges',
      'Evaluate recommendation system impacts',
      'Assess regulatory approaches to platform governance'
    ],
    content: `Digital platforms use algorithms to govern user interactions and content distribution. This module examines how these algorithmic systems shape social behavior and power relationships.`,
    keyPoints: [
      'Platform algorithms significantly influence user behavior and content visibility',
      'Content moderation involves complex tradeoffs between free speech and harm prevention',
      'Recommendation systems can create filter bubbles and echo chambers',
      'Regulatory responses are evolving to address platform power'
    ],
    practiceQuestions: [
      {
        question: 'What is a potential negative effect of recommendation algorithms?',
        options: [
          'They make platforms more profitable',
          'They increase user engagement',
          'They can create filter bubbles',
          'They personalize content'
        ],
        correctAnswer: 2,
        explanation: 'Recommendation algorithms can create filter bubbles by showing users content similar to what they\'ve previously engaged with, potentially limiting exposure to diverse perspectives.'
      }
    ]
  },
  {
    id: 'mod2-9',
    courseId: 'bsds3002',
    title: 'Privacy and Surveillance in Digital Society',
    description: 'Examining privacy challenges and surveillance practices in digital environments',
    order: 9,
    topics: ['Digital Privacy', 'Surveillance Capitalism', 'Privacy-Preserving Technologies', 'Regulatory Frameworks'],
    learningObjectives: [
      'Understand digital privacy challenges',
      'Analyze surveillance capitalism mechanisms',
      'Evaluate privacy-preserving technologies',
      'Compare different regulatory approaches'
    ],
    content: `Digital technologies create new challenges for privacy and enable new forms of surveillance. This module examines these developments and potential responses.`,
    keyPoints: [
      'Digital privacy faces new challenges from data collection and analysis',
      'Surveillance capitalism monetizes personal data and attention',
      'Privacy-preserving technologies offer technical solutions',
      'Regulatory frameworks are evolving to protect privacy rights'
    ],
    practiceQuestions: [
      {
        question: 'What is "surveillance capitalism"?',
        options: [
          'Government surveillance of citizens',
          'Using surveillance cameras in stores',
          'Business model based on extracting and analyzing personal data',
          'Surveillance by law enforcement agencies'
        ],
        correctAnswer: 2,
        explanation: 'Surveillance capitalism refers to a business model that extracts and analyzes personal data to predict and influence behavior for commercial purposes.'
      }
    ]
  },
  {
    id: 'mod2-10',
    courseId: 'bsds3002',
    title: 'Future of Social Computing',
    description: 'Emerging trends and future directions in social computing',
    order: 10,
    topics: ['Emerging Technologies', 'Virtual Reality Social Spaces', 'AI and Social Interaction', 'Ethical Considerations'],
    learningObjectives: [
      'Identify emerging trends in social computing',
      'Understand potential impacts of new technologies',
      'Analyze ethical implications of future developments',
      'Develop frameworks for responsible innovation'
    ],
    content: `Social computing continues to evolve with new technologies and changing social practices. This module explores emerging trends and their potential implications.`,
    keyPoints: [
      'Emerging technologies will create new forms of social interaction',
      'Virtual and augmented reality may transform social spaces',
      'AI will increasingly mediate social interactions',
      'Ethical considerations must guide technological development'
    ],
    practiceQuestions: [
      {
        question: 'Which emerging technology is most likely to transform social interaction in virtual spaces?',
        options: [
          'Faster internet connections',
          'Virtual and augmented reality',
          'Better smartphone cameras',
          'Longer battery life'
        ],
        correctAnswer: 1,
        explanation: 'Virtual and augmented reality technologies have the potential to create immersive social experiences that fundamentally change how people interact in digital spaces.'
      }
    ]
  },
  // BSDS3001 (course id bsds3002) — module list
  {
    id: 'mod2-1',
    courseId: 'bsds3002',
    title: 'Social Network Analysis Fundamentals',
    description: 'Introduction to social networks, graph theory, and network metrics',
    order: 1,
    topics: ['Graph Theory', 'Network Metrics', 'Centrality Measures', 'Community Detection'],
    learningObjectives: [
      'Understand basic graph theory concepts',
      'Calculate and interpret network metrics',
      'Identify influential nodes in networks',
      'Detect communities in social networks'
    ]
  },
  {
    id: 'mod2-2',
    courseId: 'bsds3002',
    title: 'Online Communities and Digital Behavior',
    description: 'Analysis of online communities, digital behavior patterns, and social influence',
    order: 2,
    topics: ['Online Communities', 'Digital Behavior', 'Social Influence', 'Information Diffusion'],
    learningObjectives: [
      'Analyze online community structures',
      'Identify patterns in digital behavior',
      'Understand mechanisms of social influence',
      'Model information spread in networks'
    ]
  },
  // BSDS3003 Modules
  {
    id: 'mod3-1',
    courseId: 'bsds3003',
    title: 'Data Processing Pipelines',
    description: 'Building robust data processing pipelines for social data',
    order: 1,
    topics: ['Data Pipelines', 'ETL Processes', 'Data Quality', 'Automation'],
    learningObjectives: [
      'Design efficient data processing pipelines',
      'Implement ETL (Extract, Transform, Load) processes',
      'Ensure data quality and consistency',
      'Automate data processing workflows'
    ]
  },
  {
    id: 'mod3-2',
    courseId: 'bsds3003',
    title: 'Advanced Data Cleaning Techniques',
    description: 'Comprehensive approaches to data cleaning and preprocessing',
    order: 2,
    topics: ['Missing Data', 'Outlier Detection', 'Data Validation', 'Standardization'],
    learningObjectives: [
      'Handle missing data appropriately',
      'Detect and manage outliers',
      'Implement data validation procedures',
      'Standardize data formats and values'
    ],
    content: `Data cleaning is often the most time-consuming part of data analysis. This module covers advanced techniques for ensuring data quality and reliability.`,
    keyPoints: [
      'Missing data requires careful consideration of imputation strategies',
      'Outliers may represent errors or important extreme cases',
      'Data validation prevents errors from propagating through analysis',
      'Standardization enables consistent analysis across datasets'
    ],
    practiceQuestions: [
      {
        question: 'When should you remove outliers from your dataset?',
        options: [
          'Always remove outliers to improve model performance',
          'Never remove outliers as they contain important information',
          'Remove outliers only when they are clearly measurement errors',
          'Remove outliers randomly to reduce dataset size'
        ],
        correctAnswer: 2,
        explanation: 'Outliers should only be removed when they are clearly measurement errors or data entry mistakes. Legitimate extreme values may contain important information.'
      }
    ]
  },
  {
    id: 'mod3-3',
    courseId: 'bsds3003',
    title: 'Data Transformation and Feature Engineering',
    description: 'Creating meaningful features from raw data',
    order: 3,
    topics: ['Feature Creation', 'Scaling and Normalization', 'Encoding Categorical Variables', 'Dimensionality Reduction'],
    learningObjectives: [
      'Create informative features from raw data',
      'Apply appropriate scaling and normalization techniques',
      'Encode categorical variables effectively',
      'Reduce dimensionality while preserving information'
    ],
    content: `Feature engineering is the process of creating meaningful variables from raw data. This module covers techniques for transforming data to improve analysis and modeling.`,
    keyPoints: [
      'Good features can significantly improve model performance',
      'Scaling ensures features contribute equally to analysis',
      'Categorical encoding must preserve meaningful relationships',
      'Dimensionality reduction can reveal hidden patterns'
    ],
    practiceQuestions: [
      {
        question: 'Why is feature scaling important in machine learning?',
        options: [
          'It makes algorithms run faster',
          'It ensures all features contribute equally to distance calculations',
          'It reduces the size of the dataset',
          'It eliminates the need for feature selection'
        ],
        correctAnswer: 1,
        explanation: 'Feature scaling ensures that all features contribute equally to distance-based calculations, preventing features with larger scales from dominating the analysis.'
      }
    ]
  },
  {
    id: 'mod3-4',
    courseId: 'bsds3003',
    title: 'Exploratory Data Analysis',
    description: 'Systematic approaches to understanding data through exploration',
    order: 4,
    topics: ['Descriptive Statistics', 'Data Distributions', 'Correlation Analysis', 'Pattern Recognition'],
    learningObjectives: [
      'Compute and interpret descriptive statistics',
      'Analyze data distributions and their properties',
      'Identify correlations and relationships',
      'Recognize patterns in complex datasets'
    ],
    content: `Exploratory Data Analysis (EDA) is crucial for understanding data before formal analysis. This module covers systematic approaches to data exploration.`,
    keyPoints: [
      'Descriptive statistics provide initial insights into data characteristics',
      'Understanding distributions helps choose appropriate analysis methods',
      'Correlation analysis reveals relationships between variables',
      'Pattern recognition guides hypothesis formation'
    ],
    practiceQuestions: [
      {
        question: 'What is the primary purpose of exploratory data analysis?',
        options: [
          'To clean the data',
          'To understand data characteristics and patterns',
          'To build predictive models',
          'To create final visualizations'
        ],
        correctAnswer: 1,
        explanation: 'The primary purpose of EDA is to understand data characteristics, identify patterns, and generate hypotheses before formal analysis.'
      }
    ]
  },
  {
    id: 'mod3-5',
    courseId: 'bsds3003',
    title: 'Statistical Visualization Principles',
    description: 'Principles of effective statistical visualization',
    order: 5,
    topics: ['Chart Selection', 'Color Theory', 'Cognitive Load', 'Accessibility'],
    learningObjectives: [
      'Choose appropriate chart types for different data',
      'Apply color theory effectively in visualizations',
      'Minimize cognitive load in visual design',
      'Create accessible visualizations for all users'
    ],
    content: `Effective visualization requires understanding both statistical principles and human perception. This module covers the foundations of good visualization design.`,
    keyPoints: [
      'Chart type should match the data type and analysis goal',
      'Color choices affect interpretation and accessibility',
      'Reducing cognitive load improves comprehension',
      'Accessible design ensures visualizations work for everyone'
    ],
    practiceQuestions: [
      {
        question: 'When is a pie chart most appropriate?',
        options: [
          'When showing trends over time',
          'When comparing many categories',
          'When showing parts of a whole with few categories',
          'When displaying correlation between variables'
        ],
        correctAnswer: 2,
        explanation: 'Pie charts are most appropriate for showing parts of a whole when there are relatively few categories (typically 5 or fewer).'
      }
    ]
  },
  {
    id: 'mod3-6',
    courseId: 'bsds3003',
    title: 'Interactive Visualization Design',
    description: 'Creating engaging interactive visualizations',
    order: 6,
    topics: ['Interaction Design', 'Dashboard Creation', 'User Experience', 'Performance Optimization'],
    learningObjectives: [
      'Design intuitive interaction patterns',
      'Create effective dashboards',
      'Optimize user experience in visualizations',
      'Ensure good performance with large datasets'
    ],
    content: `Interactive visualizations enable users to explore data dynamically. This module covers principles and techniques for creating effective interactive experiences.`,
    keyPoints: [
      'Good interaction design feels natural and intuitive',
      'Dashboards should tell a coherent story',
      'User experience principles apply to data visualization',
      'Performance optimization is crucial for large datasets'
    ],
    practiceQuestions: [
      {
        question: 'What is a key principle of dashboard design?',
        options: [
          'Include as many charts as possible',
          'Use different color schemes for each chart',
          'Focus on the most important information first',
          'Make all interactions available immediately'
        ],
        correctAnswer: 2,
        explanation: 'Effective dashboards prioritize the most important information and present it prominently, following principles of visual hierarchy.'
      }
    ]
  },
  {
    id: 'mod3-7',
    courseId: 'bsds3003',
    title: 'Geospatial Data Visualization',
    description: 'Visualizing location-based and geographic data',
    order: 7,
    topics: ['Map Projections', 'Choropleth Maps', 'Point Data Visualization', 'Spatial Analysis'],
    learningObjectives: [
      'Understand different map projections and their uses',
      'Create effective choropleth maps',
      'Visualize point-based geographic data',
      'Perform basic spatial analysis'
    ],
    content: `Geographic data requires specialized visualization techniques. This module covers methods for effectively displaying spatial information and patterns.`,
    keyPoints: [
      'Map projections affect how geographic data is displayed',
      'Choropleth maps show regional patterns effectively',
      'Point data visualization can reveal spatial clusters',
      'Spatial analysis uncovers geographic relationships'
    ],
    practiceQuestions: [
      {
        question: 'What is a choropleth map best used for?',
        options: [
          'Showing individual data points',
          'Displaying regional patterns with color coding',
          'Showing routes and paths',
          'Displaying elevation data'
        ],
        correctAnswer: 1,
        explanation: 'Choropleth maps use color coding to show how a measurement varies across geographic regions, making them ideal for displaying regional patterns.'
      }
    ]
  },
  {
    id: 'mod3-8',
    courseId: 'bsds3003',
    title: 'Time Series Visualization',
    description: 'Techniques for visualizing temporal data and trends',
    order: 8,
    topics: ['Time Series Plots', 'Trend Analysis', 'Seasonality', 'Forecasting Visualization'],
    learningObjectives: [
      'Create effective time series visualizations',
      'Identify and display trends in temporal data',
      'Visualize seasonal patterns',
      'Present forecasting results clearly'
    ],
    content: `Time series data has unique characteristics that require specialized visualization approaches. This module covers techniques for displaying temporal patterns effectively.`,
    keyPoints: [
      'Time series plots reveal patterns over time',
      'Trend analysis helps identify long-term changes',
      'Seasonal patterns repeat at regular intervals',
      'Forecasting visualizations should show uncertainty'
    ],
    practiceQuestions: [
      {
        question: 'What is seasonality in time series data?',
        options: [
          'Random fluctuations in the data',
          'Long-term trends in the data',
          'Regular patterns that repeat at fixed intervals',
          'Outliers in the time series'
        ],
        correctAnswer: 2,
        explanation: 'Seasonality refers to regular patterns that repeat at fixed intervals, such as daily, weekly, or yearly cycles in the data.'
      }
    ]
  },
  {
    id: 'mod3-9',
    courseId: 'bsds3003',
    title: 'Network and Graph Visualization',
    description: 'Visualizing relationships and network structures',
    order: 9,
    topics: ['Network Layouts', 'Node-Link Diagrams', 'Matrix Representations', 'Dynamic Networks'],
    learningObjectives: [
      'Choose appropriate network layout algorithms',
      'Create clear node-link diagrams',
      'Use matrix representations for dense networks',
      'Visualize changes in networks over time'
    ],
    content: `Network data represents relationships between entities. This module covers techniques for visualizing complex network structures and relationships.`,
    keyPoints: [
      'Layout algorithms affect network readability',
      'Node-link diagrams work well for sparse networks',
      'Matrix representations handle dense networks better',
      'Dynamic networks require temporal visualization techniques'
    ],
    practiceQuestions: [
      {
        question: 'When might a matrix representation be preferred over a node-link diagram for network visualization?',
        options: [
          'When the network has very few connections',
          'When the network is very dense with many connections',
          'When nodes have different sizes',
          'When the network changes over time'
        ],
        correctAnswer: 1,
        explanation: 'Matrix representations are often clearer than node-link diagrams for dense networks where many connections would create visual clutter.'
      }
    ]
  },
  {
    id: 'mod3-10',
    courseId: 'bsds3003',
    title: 'Advanced Visualization Techniques',
    description: 'Cutting-edge approaches to data visualization',
    order: 10,
    topics: ['Multidimensional Visualization', 'Animation and Transitions', 'Virtual Reality Visualization', 'AI-Assisted Visualization'],
    learningObjectives: [
      'Visualize high-dimensional data effectively',
      'Use animation to show changes and transitions',
      'Explore virtual reality for data visualization',
      'Understand AI-assisted visualization tools'
    ],
    content: `Advanced visualization techniques push the boundaries of how we can represent and interact with data. This module explores cutting-edge approaches and emerging technologies.`,
    keyPoints: [
      'High-dimensional data requires specialized visualization techniques',
      'Animation can effectively show changes over time',
      'Virtual reality offers new possibilities for data exploration',
      'AI can assist in creating and optimizing visualizations'
    ],
    practiceQuestions: [
      {
        question: 'What is a key advantage of using virtual reality for data visualization?',
        options: [
          'It\'s cheaper than traditional visualization',
          'It allows immersive exploration of 3D data spaces',
          'It works better on mobile devices',
          'It requires less computational power'
        ],
        correctAnswer: 1,
        explanation: 'Virtual reality enables immersive exploration of three-dimensional data spaces, allowing users to navigate and interact with data in ways not possible with traditional 2D displays.'
      }
    ]
  },
  {
    id: 'mod3-2',
    courseId: 'bsds3003',
    title: 'Advanced Visualization Techniques',
    description: 'Creating compelling and interactive visualizations for social data',
    order: 2,
    topics: ['Interactive Visualizations', 'Dashboard Design', 'Storytelling with Data', 'Accessibility'],
    learningObjectives: [
      'Create interactive data visualizations',
      'Design effective dashboards',
      'Tell compelling stories with data',
      'Ensure visualizations are accessible to all users'
    ]
  },
  // BSDS3004 Modules
  {
    id: 'mod4-1',
    courseId: 'bsds3004',
    title: 'Descriptive and Inferential Statistics',
    description: 'Foundation in statistical methods for social data analysis',
    order: 1,
    topics: ['Descriptive Statistics', 'Probability Distributions', 'Sampling', 'Central Limit Theorem'],
    learningObjectives: [
      'Calculate and interpret descriptive statistics',
      'Understand probability distributions',
      'Apply sampling techniques',
      'Use the Central Limit Theorem in practice'
    ]
  },
  {
    id: 'mod4-2',
    courseId: 'bsds3004',
    title: 'Probability Theory and Distributions',
    description: 'Fundamental concepts in probability and common distributions',
    order: 2,
    topics: ['Probability Rules', 'Bayes Theorem', 'Common Distributions', 'Random Variables'],
    learningObjectives: [
      'Apply fundamental probability rules',
      'Use Bayes theorem in practical situations',
      'Identify and work with common probability distributions',
      'Understand discrete and continuous random variables'
    ],
    content: `Probability theory provides the mathematical foundation for statistical inference. This module covers essential probability concepts and their applications in data analysis.`,
    keyPoints: [
      'Probability rules govern how we calculate likelihoods',
      'Bayes theorem enables updating beliefs with new evidence',
      'Different distributions model different types of phenomena',
      'Random variables formalize uncertainty in mathematical terms'
    ],
    practiceQuestions: [
      {
        question: 'What does Bayes theorem allow us to do?',
        options: [
          'Calculate the mean of a distribution',
          'Update probabilities based on new evidence',
          'Determine sample size requirements',
          'Test for statistical significance'
        ],
        correctAnswer: 1,
        explanation: 'Bayes theorem provides a mathematical framework for updating prior probabilities when new evidence becomes available.'
      }
    ]
  },
  {
    id: 'mod4-3',
    courseId: 'bsds3004',
    title: 'Sampling and Estimation',
    description: 'Methods for sampling populations and estimating parameters',
    order: 3,
    topics: ['Sampling Methods', 'Point Estimation', 'Confidence Intervals', 'Bias and Variance'],
    learningObjectives: [
      'Choose appropriate sampling methods',
      'Calculate point estimates for population parameters',
      'Construct and interpret confidence intervals',
      'Understand the bias-variance tradeoff'
    ],
    content: `Sampling and estimation are fundamental to statistical inference. This module covers methods for selecting representative samples and estimating population parameters.`,
    keyPoints: [
      'Different sampling methods have different strengths and limitations',
      'Point estimates provide single-value approximations of parameters',
      'Confidence intervals quantify uncertainty in estimates',
      'Bias and variance represent different types of estimation error'
    ],
    practiceQuestions: [
      {
        question: 'What does a 95% confidence interval mean?',
        options: [
          'There is a 95% chance the true parameter is in the interval',
          'If we repeated the sampling process many times, 95% of intervals would contain the true parameter',
          '95% of the data falls within the interval',
          'The estimate is 95% accurate'
        ],
        correctAnswer: 1,
        explanation: 'A 95% confidence interval means that if we repeated the sampling and estimation process many times, 95% of the resulting intervals would contain the true population parameter.'
      }
    ]
  },
  {
    id: 'mod4-4',
    courseId: 'bsds3004',
    title: 'Hypothesis Testing Fundamentals',
    description: 'Core concepts and procedures in statistical hypothesis testing',
    order: 4,
    topics: ['Null and Alternative Hypotheses', 'Type I and II Errors', 'P-values', 'Power Analysis'],
    learningObjectives: [
      'Formulate appropriate null and alternative hypotheses',
      'Understand Type I and Type II errors',
      'Interpret p-values correctly',
      'Conduct power analysis for study design'
    ],
    content: `Hypothesis testing provides a framework for making decisions under uncertainty. This module covers the fundamental concepts and procedures of statistical testing.`,
    keyPoints: [
      'Hypotheses must be formulated before data collection',
      'Type I and II errors represent different kinds of mistakes',
      'P-values measure evidence against the null hypothesis',
      'Power analysis helps determine appropriate sample sizes'
    ],
    practiceQuestions: [
      {
        question: 'What is a Type I error?',
        options: [
          'Failing to reject a false null hypothesis',
          'Rejecting a true null hypothesis',
          'Using the wrong statistical test',
          'Having too small a sample size'
        ],
        correctAnswer: 1,
        explanation: 'A Type I error occurs when we reject a null hypothesis that is actually true, leading to a false positive conclusion.'
      }
    ]
  },
  {
    id: 'mod4-5',
    courseId: 'bsds3004',
    title: 'T-tests and Non-parametric Tests',
    description: 'Comparing means and working with non-normal data',
    order: 5,
    topics: ['One-sample t-test', 'Two-sample t-test', 'Paired t-test', 'Mann-Whitney U test'],
    learningObjectives: [
      'Perform different types of t-tests',
      'Choose between parametric and non-parametric tests',
      'Understand assumptions of different tests',
      'Interpret test results appropriately'
    ],
    content: `T-tests are among the most commonly used statistical tests. This module covers different types of t-tests and alternatives for non-normal data.`,
    keyPoints: [
      'Different t-tests are used for different research designs',
      'T-tests assume normality and equal variances',
      'Non-parametric tests work with non-normal data',
      'Test assumptions should always be checked'
    ],
    practiceQuestions: [
      {
        question: 'When would you use a paired t-test instead of a two-sample t-test?',
        options: [
          'When you have more than two groups',
          'When the data is not normally distributed',
          'When comparing measurements from the same subjects',
          'When the sample sizes are different'
        ],
        correctAnswer: 2,
        explanation: 'A paired t-test is used when comparing two measurements from the same subjects (e.g., before and after treatment), which creates paired observations.'
      }
    ]
  },
  {
    id: 'mod4-6',
    courseId: 'bsds3004',
    title: 'Analysis of Variance (ANOVA)',
    description: 'Comparing means across multiple groups',
    order: 6,
    topics: ['One-way ANOVA', 'Two-way ANOVA', 'Post-hoc Tests', 'Effect Size'],
    learningObjectives: [
      'Perform one-way and two-way ANOVA',
      'Conduct appropriate post-hoc tests',
      'Calculate and interpret effect sizes',
      'Understand ANOVA assumptions'
    ],
    content: `ANOVA extends t-tests to compare means across multiple groups. This module covers different types of ANOVA and related procedures.`,
    keyPoints: [
      'ANOVA tests for differences among group means',
      'Post-hoc tests identify which groups differ',
      'Effect size measures practical significance',
      'ANOVA has similar assumptions to t-tests'
    ],
    practiceQuestions: [
      {
        question: 'Why do we use ANOVA instead of multiple t-tests when comparing several groups?',
        options: [
          'ANOVA is faster to compute',
          'ANOVA controls the overall Type I error rate',
          'ANOVA works with smaller sample sizes',
          'ANOVA doesn\'t require assumptions'
        ],
        correctAnswer: 1,
        explanation: 'ANOVA controls the overall Type I error rate when making multiple comparisons, whereas conducting multiple t-tests inflates the probability of making a Type I error.'
      }
    ]
  },
  {
    id: 'mod4-7',
    courseId: 'bsds3004',
    title: 'Correlation and Simple Linear Regression',
    description: 'Analyzing relationships between continuous variables',
    order: 7,
    topics: ['Pearson Correlation', 'Spearman Correlation', 'Simple Linear Regression', 'Residual Analysis'],
    learningObjectives: [
      'Calculate and interpret correlation coefficients',
      'Fit simple linear regression models',
      'Analyze residuals to check model assumptions',
      'Distinguish between correlation and causation'
    ],
    content: `Correlation and regression analyze relationships between variables. This module covers methods for quantifying and modeling these relationships.`,
    keyPoints: [
      'Correlation measures the strength of linear relationships',
      'Regression models can predict one variable from another',
      'Residual analysis checks model assumptions',
      'Correlation does not imply causation'
    ],
    practiceQuestions: [
      {
        question: 'What does a correlation coefficient of -0.8 indicate?',
        options: [
          'A weak negative relationship',
          'A strong positive relationship',
          'A strong negative relationship',
          'No relationship'
        ],
        correctAnswer: 2,
        explanation: 'A correlation coefficient of -0.8 indicates a strong negative relationship, meaning as one variable increases, the other tends to decrease substantially.'
      }
    ]
  },
  {
    id: 'mod4-8',
    courseId: 'bsds3004',
    title: 'Multiple Linear Regression',
    description: 'Modeling relationships with multiple predictors',
    order: 8,
    topics: ['Multiple Regression', 'Model Selection', 'Multicollinearity', 'Interaction Effects'],
    learningObjectives: [
      'Fit and interpret multiple regression models',
      'Select appropriate variables for models',
      'Detect and handle multicollinearity',
      'Include interaction effects in models'
    ],
    content: `Multiple regression extends simple regression to include multiple predictor variables. This module covers advanced regression techniques and model building strategies.`,
    keyPoints: [
      'Multiple regression can include several predictor variables',
      'Model selection balances fit and complexity',
      'Multicollinearity can cause interpretation problems',
      'Interaction effects capture non-additive relationships'
    ],
    practiceQuestions: [
      {
        question: 'What is multicollinearity in multiple regression?',
        options: [
          'When the dependent variable is correlated with predictors',
          'When predictor variables are highly correlated with each other',
          'When residuals are correlated',
          'When the model has too many variables'
        ],
        correctAnswer: 1,
        explanation: 'Multicollinearity occurs when predictor variables are highly correlated with each other, making it difficult to determine their individual effects.'
      }
    ]
  },
  {
    id: 'mod4-9',
    courseId: 'bsds3004',
    title: 'Categorical Data Analysis',
    description: 'Statistical methods for categorical and count data',
    order: 9,
    topics: ['Chi-square Tests', 'Contingency Tables', 'Logistic Regression', 'Odds Ratios'],
    learningObjectives: [
      'Analyze categorical data with chi-square tests',
      'Interpret contingency tables',
      'Fit logistic regression models',
      'Calculate and interpret odds ratios'
    ],
    content: `Categorical data requires specialized statistical methods. This module covers techniques for analyzing relationships between categorical variables.`,
    keyPoints: [
      'Chi-square tests analyze relationships between categorical variables',
      'Contingency tables display categorical data relationships',
      'Logistic regression models binary outcomes',
      'Odds ratios quantify the strength of associations'
    ],
    practiceQuestions: [
      {
        question: 'When would you use logistic regression instead of linear regression?',
        options: [
          'When you have categorical predictors',
          'When the outcome variable is binary',
          'When you have a small sample size',
          'When the data is not normally distributed'
        ],
        correctAnswer: 1,
        explanation: 'Logistic regression is used when the outcome variable is binary (e.g., yes/no, success/failure), as linear regression is not appropriate for binary outcomes.'
      }
    ]
  },
  {
    id: 'mod4-10',
    courseId: 'bsds3004',
    title: 'Statistical Computing and Reproducibility',
    description: 'Using statistical software and ensuring reproducible analysis',
    order: 10,
    topics: ['R Programming', 'Statistical Packages', 'Reproducible Workflows', 'Report Generation'],
    learningObjectives: [
      'Use statistical software effectively',
      'Create reproducible analysis workflows',
      'Generate automated reports',
      'Follow best practices for statistical computing'
    ],
    content: `Modern statistics relies heavily on computational tools. This module covers statistical software and practices for reproducible analysis.`,
    keyPoints: [
      'Statistical software automates complex calculations',
      'Reproducible workflows ensure reliable results',
      'Automated reports reduce errors and save time',
      'Best practices improve analysis quality and efficiency'
    ],
    practiceQuestions: [
      {
        question: 'What is the main benefit of creating reproducible statistical analyses?',
        options: [
          'They run faster than non-reproducible analyses',
          'They use less computer memory',
          'Others can verify and build upon the work',
          'They require less statistical knowledge'
        ],
        correctAnswer: 2,
        explanation: 'Reproducible analyses allow others to verify results, understand methods, and build upon the work, which is essential for scientific progress.'
      }
    ]
  },
  {
    id: 'mod4-2',
    courseId: 'bsds3004',
    title: 'Hypothesis Testing and Regression',
    description: 'Advanced statistical methods for testing hypotheses and modeling relationships',
    order: 2,
    topics: ['Hypothesis Testing', 'T-tests', 'ANOVA', 'Linear Regression', 'Model Validation'],
    learningObjectives: [
      'Design and conduct hypothesis tests',
      'Choose appropriate statistical tests',
      'Build and validate regression models',
      'Interpret statistical results correctly'
    ]
  }
];

export const mockCourseResources: CourseResource[] = [
  // BSDS3001 Resources
  {
    id: 'res1-1',
    courseId: 'bsds3001',
    title: 'Ethics in Social Data Science: A Comprehensive Guide',
    description: 'Essential reading on ethical considerations in social data science research and practice',
    type: 'reading',
    author: 'Dr. Sarah Chen',
    estimatedTime: '45 minutes',
    content: 'This comprehensive guide covers the fundamental ethical principles that should guide social data science research...'
  },
  {
    id: 'res1-2',
    courseId: 'bsds3001',
    title: 'Python for Social Scientists',
    description: 'Interactive tutorial series covering Python programming specifically for social science applications',
    type: 'tutorial',
    author: 'DataCamp',
    estimatedTime: '3 hours',
    url: 'https://example.com/python-social-scientists'
  },
  {
    id: 'res1-3',
    courseId: 'bsds3001',
    title: 'GDPR and Data Science: What You Need to Know',
    description: 'Video lecture on GDPR compliance in data science projects',
    type: 'video',
    author: 'Prof. Maria Rodriguez',
    estimatedTime: '30 minutes',
    url: 'https://example.com/gdpr-data-science'
  },
  {
    id: 'res1-4',
    courseId: 'bsds3001',
    title: 'Social Media Privacy Dataset',
    description: 'Anonymized dataset for practicing ethical data handling techniques',
    type: 'dataset',
    estimatedTime: '2 hours analysis',
    url: 'https://example.com/privacy-dataset'
  },
  // BSDS3001 (course id bsds3002) — resources
  {
    id: 'res2-1',
    courseId: 'bsds3002',
    title: 'Networks, Crowds, and Markets: Reasoning About a Highly Connected World',
    description: 'Classic textbook on network analysis and social computing by Easley and Kleinberg',
    type: 'reading',
    author: 'Easley & Kleinberg',
    estimatedTime: '2 hours',
    content: 'This foundational text explores the mathematical and algorithmic foundations of social networks...'
  },
  {
    id: 'res2-2',
    courseId: 'bsds3002',
    title: 'NetworkX Tutorial: Social Network Analysis in Python',
    description: 'Hands-on tutorial for using NetworkX library for social network analysis',
    type: 'tutorial',
    author: 'NetworkX Team',
    estimatedTime: '90 minutes',
    url: 'https://example.com/networkx-tutorial'
  },
  {
    id: 'res2-3',
    courseId: 'bsds3002',
    title: 'Gephi: Network Visualization Tool',
    description: 'Professional network visualization and analysis software',
    type: 'tool',
    estimatedTime: '1 hour setup',
    url: 'https://gephi.org'
  },
  {
    id: 'res2-4',
    courseId: 'bsds3002',
    title: 'Twitter Social Network Dataset',
    description: 'Large-scale Twitter network data for analysis projects',
    type: 'dataset',
    estimatedTime: '3 hours analysis',
    url: 'https://example.com/twitter-network-data'
  },
  // BSDS3003 Resources
  {
    id: 'res3-1',
    courseId: 'bsds3003',
    title: 'Data Visualization: A Practical Introduction',
    description: 'Comprehensive guide to creating effective data visualizations',
    type: 'reading',
    author: 'Kieran Healy',
    estimatedTime: '90 minutes',
    content: 'This practical guide teaches you how to create compelling visualizations that communicate effectively...'
  },
  {
    id: 'res3-2',
    courseId: 'bsds3003',
    title: 'Pandas Data Processing Masterclass',
    description: 'Advanced techniques for data cleaning and processing with pandas',
    type: 'tutorial',
    author: 'Python Institute',
    estimatedTime: '4 hours',
    url: 'https://example.com/pandas-masterclass'
  },
  {
    id: 'res3-3',
    courseId: 'bsds3003',
    title: 'Tableau Public: Data Visualization Platform',
    description: 'Free platform for creating interactive data visualizations',
    type: 'tool',
    estimatedTime: '2 hours learning',
    url: 'https://public.tableau.com'
  },
  {
    id: 'res3-4',
    courseId: 'bsds3003',
    title: 'Social Media Engagement Dataset',
    description: 'Multi-platform social media engagement data for visualization projects',
    type: 'dataset',
    estimatedTime: '2 hours analysis',
    url: 'https://example.com/social-engagement-data'
  },
  // BSDS3004 Resources
  {
    id: 'res4-1',
    courseId: 'bsds3004',
    title: 'Think Stats: Exploratory Data Analysis in Python',
    description: 'Introduction to statistics and probability for programmers',
    type: 'reading',
    author: 'Allen B. Downey',
    estimatedTime: '2 hours',
    content: 'This book teaches statistical thinking through programming, using Python to explore real datasets...'
  },
  {
    id: 'res4-2',
    courseId: 'bsds3004',
    title: 'SciPy Statistics Tutorial',
    description: 'Comprehensive tutorial on statistical analysis using SciPy',
    type: 'tutorial',
    author: 'SciPy Community',
    estimatedTime: '3 hours',
    url: 'https://example.com/scipy-stats-tutorial'
  },
  {
    id: 'res4-3',
    courseId: 'bsds3004',
    title: 'R for Statistical Analysis',
    description: 'Alternative statistical computing environment for advanced analysis',
    type: 'tool',
    estimatedTime: '4 hours learning',
    url: 'https://www.r-project.org'
  },
  {
    id: 'res4-4',
    courseId: 'bsds3004',
    title: 'Social Psychology Research Dataset',
    description: 'Real research data for practicing statistical analysis techniques',
    type: 'dataset',
    estimatedTime: '3 hours analysis',
    url: 'https://example.com/psychology-research-data'
  }
];

export const mockAssignments: Assignment[] = [
  // BSDS3001 - Social Computing: Methods and Applications
  {
    id: 'assign1-1',
    courseId: 'bsds3001',
    title: 'Data Ethics Report',
    description: 'Write a comprehensive report on ethical considerations in data collection and analysis. Include case studies and best practices.',
    type: 'report',
    dueDate: '2024-12-20',
    status: 'not-started',
    maxPoints: 100,
    topics: ['Data Ethics', 'Privacy', 'GDPR', 'Case Studies'],
    instructions: 'Write a 2000-3000 word report covering ethical issues in data science, including privacy concerns, consent, and data protection regulations. Include at least 3 case studies.',
    requirements: [
      '2000-3000 words',
      'Include at least 3 case studies',
      'Reference academic sources',
      'Discuss GDPR and other regulations',
      'Provide recommendations'
    ]
  },
  {
    id: 'assign1-2',
    courseId: 'bsds3001',
    title: 'Python Data Processing Assignment',
    description: 'Implement a Python program to clean and process social media data. Handle missing values, outliers, and data normalization.',
    type: 'code',
    dueDate: '2024-12-18',
    status: 'in-progress',
    maxPoints: 150,
    topics: ['Python', 'Data Cleaning', 'Pandas', 'Data Processing'],
    instructions: 'Create a Python script that processes a dataset of social media posts. Your script should handle missing values, detect outliers, normalize data, and generate a summary report.',
    requirements: [
      'Use pandas for data manipulation',
      'Handle missing values appropriately',
      'Detect and handle outliers',
      'Normalize numeric data',
      'Generate a summary report',
      'Include error handling',
      'Add comments and docstrings'
    ]
  },
  {
    id: 'assign1-4',
    courseId: 'bsds3001',
    title: 'Programming Task 02 - Social Data Pipelines',
    description: 'Complete Programming Task 02 by implementing an end-to-end data pipeline for social media analytics, including ingestion, cleaning, feature extraction, and reporting.',
    type: 'code',
    dueDate: '2024-12-22',
    status: 'not-started',
    maxPoints: 180,
    topics: ['Python', 'APIs', 'Automation', 'Data Engineering', 'Reporting'],
    instructions: 'Follow the Programming Task 02 PDF provided in the documents folder. Build a modular pipeline that ingests social data, cleans and enriches it, computes engagement metrics, and outputs both tabular and visual summaries. Document your architecture and testing approach.',
    requirements: [
      'Use functions or classes to organize pipeline stages',
      'Implement data ingestion from at least one API or simulated source',
      'Handle missing or malformed records gracefully',
      'Generate summary statistics and at least one visualization',
      'Export cleaned data and reports to files',
      'Include a README explaining setup, execution, and assumptions',
      'Provide automated tests or validation scripts for critical steps'
    ]
  },
  {
    id: 'assign1-3',
    courseId: 'bsds3001',
    title: 'Data Ethics Quiz',
    description: 'Test your knowledge of data ethics, privacy laws, and ethical data collection practices.',
    type: 'quiz',
    dueDate: '2024-12-15',
    status: 'submitted',
    points: 85,
      maxPoints: 100,
      topics: ['Data Ethics', 'Privacy Laws', 'GDPR', 'Best Practices'],
      isPublished: true,
  },
  // BSDS3001 - Social Computing: Methods and Applications (course id bsds3002)
  {
    id: 'assign2-1',
    courseId: 'bsds3002',
    title: 'Social Network Analysis Report',
    description: 'Analyze a social network dataset and write a report on network structure, communities, and key influencers.',
    type: 'report',
    dueDate: '2024-12-22',
    status: 'not-started',
    maxPoints: 120,
    topics: ['Social Networks', 'Network Analysis', 'Communities', 'Graph Theory'],
    instructions: 'Analyze a provided social network dataset using network analysis techniques. Identify communities, key nodes, and network properties. Write a 2500-3500 word report with visualizations.',
    requirements: [
      '2500-3500 words',
      'Include network visualizations',
      'Identify communities',
      'Analyze key influencers',
      'Discuss network properties',
      'Provide insights and conclusions'
    ]
  },
  {
    id: 'assign2-2',
    courseId: 'bsds3002',
    title: 'Community Detection Algorithm',
    description: 'Implement a community detection algorithm (e.g., Louvain method) and apply it to a social network dataset.',
    type: 'code',
    dueDate: '2024-12-19',
    status: 'not-started',
    maxPoints: 200,
    topics: ['Algorithms', 'Graph Theory', 'Community Detection', 'NetworkX'],
    instructions: 'Implement the Louvain community detection algorithm or another community detection method. Apply it to a social network dataset and visualize the results.',
    requirements: [
      'Implement community detection algorithm',
      'Use NetworkX or similar library',
      'Visualize communities',
      'Compare with ground truth (if available)',
      'Include performance metrics',
      'Write clear documentation',
      'Include test cases'
    ]
  },
  {
    id: 'assign2-3',
    courseId: 'bsds3002',
    title: 'Social Computing Concepts Quiz',
    description: 'Test your understanding of social computing concepts, network analysis, and online community dynamics.',
    type: 'quiz',
    dueDate: '2024-12-16',
    status: 'graded',
    points: 92,
    maxPoints: 100,
    topics: ['Social Computing', 'Network Analysis', 'Online Communities', 'Social Media'],
    isPublished: true,
  },
  // BSDS3003 - Data Processing and Visualization
  {
    id: 'assign3-1',
    courseId: 'bsds3003',
    title: 'Data Visualization Portfolio',
    description: 'Create a portfolio of data visualizations using different tools and techniques. Include interactive visualizations and explain design choices.',
    type: 'report',
    dueDate: '2024-12-21',
    status: 'in-progress',
    maxPoints: 150,
    topics: ['Data Visualization', 'D3.js', 'Matplotlib', 'Tableau', 'Design'],
    instructions: 'Create a portfolio of 5-7 data visualizations using different tools (Python, D3.js, Tableau, etc.). Each visualization should tell a story and include a brief explanation of design choices.',
    requirements: [
      '5-7 visualizations',
      'Use multiple tools',
      'Include interactive visualizations',
      'Explain design choices',
      'Provide insights from each visualization',
      'Include code/scripts',
      'Write a 1500-2000 word report'
    ]
  },
  {
    id: 'assign3-2',
    courseId: 'bsds3003',
    title: 'Interactive Dashboard Development',
    description: 'Build an interactive dashboard for exploring social data. Use web technologies like React, D3.js, or similar frameworks.',
    type: 'code',
    dueDate: '2024-12-20',
    status: 'not-started',
    maxPoints: 250,
    topics: ['Web Development', 'React', 'D3.js', 'Dashboards', 'Data Visualization'],
    instructions: 'Create an interactive web dashboard that allows users to explore social data. Include filtering, sorting, and multiple visualization types. Deploy the dashboard online.',
    requirements: [
      'Interactive dashboard',
      'Multiple visualization types',
      'Filtering and sorting capabilities',
      'Responsive design',
      'Clean user interface',
      'Deploy online',
      'Include documentation',
      'Test with different datasets'
    ]
  },
  {
    id: 'assign3-3',
    courseId: 'bsds3003',
    title: 'Data Visualization Principles Quiz',
    description: 'Test your knowledge of data visualization principles, design choices, and best practices.',
    type: 'quiz',
    dueDate: '2024-12-17',
    status: 'submitted',
    points: 88,
    maxPoints: 100,
    topics: ['Visualization Principles', 'Design', 'Color Theory', 'Best Practices'],
    isPublished: true,
  },
  // BSDS3001 - Lecture-based Assessments (01-11)
  {
    id: 'lecture-assess-01',
    courseId: 'bsds3001',
    title: 'Assessment - Lecture 01',
    description: 'Learning evaluation based on Lecture 01 materials. Complete this assessment using concepts and materials from Lecture 01 slides.',
    type: 'report',
    dueDate: '2024-12-25',
    status: 'not-started',
    maxPoints: 100,
    lectureNumber: '01',
    topics: ['Lecture 01 Concepts', 'Foundational Topics'],
    instructions: 'Review Lecture 01 slides and complete this assessment. Questions and problems are generated based on the content covered in Lecture 01. Reference the lecture materials when answering.',
    requirements: [
      'Review Lecture 01 PDF materials',
      'Answer questions based on lecture content',
      'Apply concepts from Lecture 01',
      'Reference specific slides when applicable'
    ]
  },
  {
    id: 'lecture-assess-02',
    courseId: 'bsds3001',
    title: 'Assessment - Lecture 02',
    description: 'Learning evaluation based on Lecture 02 materials. Complete this assessment using concepts and materials from Lecture 02 slides.',
    type: 'report',
    dueDate: '2024-12-26',
    status: 'not-started',
    maxPoints: 100,
    lectureNumber: '02',
    topics: ['Lecture 02 Concepts', 'Advanced Topics'],
    instructions: 'Review Lecture 02 slides and complete this assessment. Questions and problems are generated based on the content covered in Lecture 02. Reference the lecture materials when answering.',
    requirements: [
      'Review Lecture 02 PDF materials',
      'Answer questions based on lecture content',
      'Apply concepts from Lecture 02',
      'Reference specific slides when applicable'
    ]
  },
  {
    id: 'lecture-assess-03',
    courseId: 'bsds3001',
    title: 'Assessment - Lecture 03',
    description: 'Learning evaluation based on Lecture 03 materials. Complete this assessment using concepts and materials from Lecture 03 slides.',
    type: 'code',
    dueDate: '2024-12-27',
    status: 'not-started',
    maxPoints: 100,
    lectureNumber: '03',
    topics: ['Lecture 03 Concepts', 'Programming Topics'],
    instructions: 'Review Lecture 03 slides and complete this coding assessment. Problems are generated based on the programming concepts covered in Lecture 03. Use the lecture materials as reference.',
    requirements: [
      'Review Lecture 03 PDF materials',
      'Implement solutions based on lecture concepts',
      'Apply programming techniques from Lecture 03',
      'Reference specific slides when applicable'
    ]
  },
  {
    id: 'lecture-assess-04',
    courseId: 'bsds3001',
    title: 'Assessment - Lecture 04',
    description: 'Learning evaluation based on Lecture 04 materials. Complete this assessment using concepts and materials from Lecture 04 slides.',
    type: 'report',
    dueDate: '2024-12-28',
    status: 'not-started',
    maxPoints: 100,
    lectureNumber: '04',
    topics: ['Lecture 04 Concepts', 'Data Analysis'],
    instructions: 'Review Lecture 04 slides and complete this assessment. Questions are generated based on the content covered in Lecture 04. Reference the lecture materials when answering.',
    requirements: [
      'Review Lecture 04 PDF materials',
      'Answer questions based on lecture content',
      'Apply concepts from Lecture 04',
      'Reference specific slides when applicable'
    ]
  },
  {
    id: 'lecture-assess-05',
    courseId: 'bsds3001',
    title: 'Assessment - Lecture 05',
    description: 'Learning evaluation based on Lecture 05 materials. Complete this assessment using concepts and materials from Lecture 05 slides.',
    type: 'code',
    dueDate: '2024-12-29',
    status: 'not-started',
    maxPoints: 100,
    lectureNumber: '05',
    topics: ['Lecture 05 Concepts', 'Advanced Programming'],
    instructions: 'Review Lecture 05 slides and complete this coding assessment. Problems are generated based on the programming concepts covered in Lecture 05. Use the lecture materials as reference.',
    requirements: [
      'Review Lecture 05 PDF materials',
      'Implement solutions based on lecture concepts',
      'Apply programming techniques from Lecture 05',
      'Reference specific slides when applicable'
    ]
  },
  {
    id: 'lecture-assess-07',
    courseId: 'bsds3001',
    title: 'Assessment - Lecture 07',
    description: 'Learning evaluation based on Lecture 07 materials. Complete this assessment using concepts and materials from Lecture 07 slides.',
    type: 'report',
    dueDate: '2024-12-30',
    status: 'not-started',
    maxPoints: 100,
    lectureNumber: '07',
    topics: ['Lecture 07 Concepts', 'Specialized Topics'],
    instructions: 'Review Lecture 07 slides and complete this assessment. Questions are generated based on the content covered in Lecture 07. Reference the lecture materials when answering.',
    requirements: [
      'Review Lecture 07 PDF materials',
      'Answer questions based on lecture content',
      'Apply concepts from Lecture 07',
      'Reference specific slides when applicable'
    ]
  },
  {
    id: 'lecture-assess-08',
    courseId: 'bsds3001',
    title: 'Assessment - Lecture 08',
    description: 'Learning evaluation based on Lecture 08 materials. Complete this assessment using concepts and materials from Lecture 08 slides.',
    type: 'code',
    dueDate: '2024-12-31',
    status: 'not-started',
    maxPoints: 100,
    lectureNumber: '08',
    topics: ['Lecture 08 Concepts', 'Implementation'],
    instructions: 'Review Lecture 08 slides and complete this coding assessment. Problems are generated based on the programming concepts covered in Lecture 08. Use the lecture materials as reference.',
    requirements: [
      'Review Lecture 08 PDF materials',
      'Implement solutions based on lecture concepts',
      'Apply programming techniques from Lecture 08',
      'Reference specific slides when applicable'
    ]
  },
  {
    id: 'lecture-assess-09',
    courseId: 'bsds3001',
    title: 'Assessment - Lecture 09',
    description: 'Learning evaluation based on Lecture 09 materials. Complete this assessment using concepts and materials from Lecture 09 slides.',
    type: 'report',
    dueDate: '2025-01-01',
    status: 'not-started',
    maxPoints: 100,
    lectureNumber: '09',
    topics: ['Lecture 09 Concepts', 'Advanced Analysis'],
    instructions: 'Review Lecture 09 slides and complete this assessment. Questions are generated based on the content covered in Lecture 09. Reference the lecture materials when answering.',
    requirements: [
      'Review Lecture 09 PDF materials',
      'Answer questions based on lecture content',
      'Apply concepts from Lecture 09',
      'Reference specific slides when applicable'
    ]
  },
  {
    id: 'lecture-assess-10',
    courseId: 'bsds3001',
    title: 'Assessment - Lecture 10',
    description: 'Learning evaluation based on Lecture 10 materials. Complete this assessment using concepts and materials from Lecture 10 slides.',
    type: 'code',
    dueDate: '2025-01-02',
    status: 'not-started',
    maxPoints: 100,
    lectureNumber: '10',
    topics: ['Lecture 10 Concepts', 'Complex Programming'],
    instructions: 'Review Lecture 10 slides and complete this coding assessment. Problems are generated based on the programming concepts covered in Lecture 10. Use the lecture materials as reference.',
    requirements: [
      'Review Lecture 10 PDF materials',
      'Implement solutions based on lecture concepts',
      'Apply programming techniques from Lecture 10',
      'Reference specific slides when applicable'
    ]
  },
  {
    id: 'lecture-assess-11',
    courseId: 'bsds3001',
    title: 'Assessment - Lecture 11',
    description: 'Learning evaluation based on Lecture 11 materials. Complete this assessment using concepts and materials from Lecture 11 slides.',
    type: 'report',
    dueDate: '2025-01-03',
    status: 'not-started',
    maxPoints: 100,
    lectureNumber: '11',
    topics: ['Lecture 11 Concepts', 'Final Topics'],
    instructions: 'Review Lecture 11 slides and complete this assessment. Questions are generated based on the content covered in Lecture 11. Reference the lecture materials when answering.',
    requirements: [
      'Review Lecture 11 PDF materials',
      'Answer questions based on lecture content',
      'Apply concepts from Lecture 11',
      'Reference specific slides when applicable'
    ]
  },
  // BSDS3004 - Introduction to Statistics
  {
    id: 'assign4-1',
    courseId: 'bsds3004',
    title: 'Statistical Analysis Report',
    description: 'Perform statistical analysis on a social science dataset. Apply hypothesis testing, regression analysis, and interpret results.',
    type: 'report',
    dueDate: '2024-12-23',
    status: 'not-started',
    maxPoints: 180,
    topics: ['Statistics', 'Hypothesis Testing', 'Regression', 'Data Analysis'],
    instructions: 'Analyze a social science dataset using statistical methods. Perform hypothesis testing, regression analysis, and interpret the results. Write a 3000-4000 word report with statistical outputs and interpretations.',
    requirements: [
      '3000-4000 words',
      'Perform hypothesis testing',
      'Conduct regression analysis',
      'Interpret statistical results',
      'Include visualizations',
      'Discuss limitations',
      'Provide conclusions'
    ]
  },
  {
    id: 'assign4-2',
    courseId: 'bsds3004',
    title: 'Statistical Analysis Script',
    description: 'Create a Python/R script that performs comprehensive statistical analysis including descriptive statistics, hypothesis testing, and regression.',
    type: 'code',
    dueDate: '2024-12-21',
    status: 'not-started',
    maxPoints: 200,
    topics: ['Python', 'R', 'Statistics', 'Hypothesis Testing', 'Regression'],
    instructions: 'Write a script (Python or R) that performs statistical analysis on a dataset. Include descriptive statistics, hypothesis testing, regression analysis, and generate a report.',
    requirements: [
      'Descriptive statistics',
      'Hypothesis testing',
      'Regression analysis',
      'Generate statistical report',
      'Include visualizations',
      'Handle missing data',
      'Document assumptions',
      'Include comments and documentation'
    ]
  },
  {
    id: 'assign4-3',
    courseId: 'bsds3004',
    title: 'Statistics Fundamentals Quiz',
    description: 'Test your understanding of statistical concepts, hypothesis testing, and data analysis methods.',
    type: 'quiz',
    dueDate: '2024-12-18',
    status: 'graded',
    points: 90,
    maxPoints: 100,
    topics: ['Statistics', 'Hypothesis Testing', 'Probability', 'Regression'],
    isPublished: true,
  }
];