import { supabase } from '../lib/supabase';

export class SubmissionNotificationService {
  // Helper function to validate email format
  private static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Helper function to get student's first name by ID
  private static async getStudentFirstName(studentId: string): Promise<string | null> {
    try {
      // Get user info from users table
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('name')
        .eq('id', studentId)
        .single();

      if (!userError && userData && userData.name) {
        // Extract first name (everything before first space)
        const firstName = userData.name.split(' ')[0];
        return firstName;
      }

      return null;
    } catch (error) {
      console.error('[SubmissionNotificationService] Error fetching student first name:', error);
      return null;
    }
  }

  // Helper function to send notification emails via Edge Function
  private static async sendNotificationEmail(
    subject: string,
    content: string,
    recipientEmail: string,
    studentFirstName?: string | null
  ): Promise<void> {
    try {
      if (!recipientEmail) {
        console.warn('[SubmissionNotificationService] No recipient email provided, skipping email notification');
        return;
      }

      // Validate email format
      if (!this.isValidEmail(recipientEmail)) {
        console.error(`[SubmissionNotificationService] ❌ Invalid email format: ${recipientEmail}`);
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (!supabaseUrl) {
        console.error('[SubmissionNotificationService] ❌ VITE_SUPABASE_URL is not configured, skipping email notification');
        return;
      }

      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!supabaseAnonKey) {
        console.error('[SubmissionNotificationService] ❌ VITE_SUPABASE_ANON_KEY is not configured, skipping email notification');
        return;
      }

      console.log(`[SubmissionNotificationService] 📧 Sending submission confirmation email to ${recipientEmail}`);

      const response = await fetch(`${supabaseUrl}/functions/v1/send-notification-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          subject,
          content,
          recipient_emails: [recipientEmail],
          student_first_name: studentFirstName || undefined,
        }),
      });

      const responseText = await response.text();
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { raw: responseText };
      }

      if (!response.ok) {
        console.error('[SubmissionNotificationService] ❌ Error sending submission confirmation email:', {
          status: response.status,
          statusText: response.statusText,
          error: responseData,
          recipientEmail: recipientEmail
        });
        throw new Error(`Failed to send email: ${response.status} ${response.statusText}`);
      } else {
        console.log('[SubmissionNotificationService] ✅ Submission confirmation email sent successfully:', {
          email: recipientEmail,
          response: responseData
        });
      }
    } catch (error) {
      console.error('[SubmissionNotificationService] ❌ Error calling send-notification-email function:', {
        error: error instanceof Error ? error.message : String(error),
        recipientEmail: recipientEmail,
        stack: error instanceof Error ? error.stack : undefined
      });
      // Don't throw - email failure shouldn't block submission
    }
  }

  // Helper function to get student email by ID
  private static async getStudentEmail(studentId: string): Promise<string | null> {
    try {
      // First, try to get email from current session if the studentId matches current user
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id === studentId && session.user.email) {
        console.log(`[SubmissionNotificationService] Got email from current session for ${studentId}`);
        return session.user.email;
      }

      // Try to get email via RPC function (accesses auth.users)
      const { data: email, error: rpcError } = await supabase
        .rpc('get_user_email', { user_id: studentId });

      if (!rpcError && email) {
        console.log(`[SubmissionNotificationService] Got email via RPC for ${studentId}`);
        return email;
      }

      // Fallback: try to get from users table (in case email column exists)
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('email')
        .eq('id', studentId)
        .single();

      if (!userError && userData && (userData as any).email) {
        console.log(`[SubmissionNotificationService] Got email from users table for ${studentId}`);
        return (userData as any).email;
      }

      console.warn(`[SubmissionNotificationService] Could not find email for student ${studentId}`, {
        rpcError: rpcError?.message,
        userError: userError?.message
      });
      return null;
    } catch (error) {
      console.error('[SubmissionNotificationService] Error fetching student email:', error);
      return null;
    }
  }

  // Send assignment submission confirmation email
  static async sendAssignmentSubmissionEmail(
    studentId: string,
    taskTitle: string,
    courseName: string,
    submittedAt: string
  ): Promise<void> {
    try {
      const [studentEmail, studentFirstName] = await Promise.all([
        this.getStudentEmail(studentId),
        this.getStudentFirstName(studentId)
      ]);
      
      if (!studentEmail) {
        console.warn('[SubmissionNotificationService] Cannot send assignment submission email: student email not found');
        return;
      }

      // Replace "Unknown Course" with "HKU BSDS3002"
      const displayCourseName = courseName === 'Unknown Course' ? 'HKU BSDS3002' : courseName;

      const subject = `Assignment Submitted: ${taskTitle}`;
      const content = `Dear Student,

Your assignment submission has been successfully received!

**Assignment Details:**
• Assignment: ${taskTitle}
• Course: ${displayCourseName}
• Submitted At: ${new Date(submittedAt).toLocaleString()}

Your submission has been recorded and is now under review. You will be notified once your assignment has been graded.

Thank you for your submission!

Best regards,
StreamLearn Platform`;

      await this.sendNotificationEmail(subject, content, studentEmail, studentFirstName);
    } catch (error) {
      console.error('[SubmissionNotificationService] Error sending assignment submission email:', error);
    }
  }

  // Send quiz submission confirmation email
  static async sendQuizSubmissionEmail(
    studentId: string,
    quizTitle: string,
    courseName: string,
    score: number | null,
    totalQuestions: number,
    submittedAt: string
  ): Promise<void> {
    try {
      const studentEmail = await this.getStudentEmail(studentId);
      if (!studentEmail) {
        console.warn('[SubmissionNotificationService] Cannot send quiz submission email: student email not found');
        return;
      }

      const subject = `Quiz Submitted: ${quizTitle}`;
      const scoreInfo = score !== null 
        ? `• Score: ${score}/${totalQuestions} (${Math.round((score / totalQuestions) * 100)}%)`
        : '• Score: Pending review';

      const content = `Dear Student,

Your quiz submission has been successfully received!

**Quiz Details:**
• Quiz: ${quizTitle}
• Course: ${courseName}
• Total Questions: ${totalQuestions}
${scoreInfo}
• Submitted At: ${new Date(submittedAt).toLocaleString()}

Your quiz has been submitted and ${score !== null ? 'graded' : 'is being reviewed'}.

Thank you for completing the quiz!

Best regards,
StreamLearn Platform`;

      await this.sendNotificationEmail(subject, content, studentEmail);
    } catch (error) {
      console.error('[SubmissionNotificationService] Error sending quiz submission email:', error);
    }
  }

  // Send attendance submission confirmation email
  static async sendAttendanceSubmissionEmail(
    studentId: string,
    lectureTitle: string,
    courseName: string,
    lectureDate: string,
    submittedAt: string
  ): Promise<void> {
    try {
      const studentEmail = await this.getStudentEmail(studentId);
      if (!studentEmail) {
        console.warn('[SubmissionNotificationService] Cannot send attendance submission email: student email not found');
        return;
      }

      const subject = `Attendance Recorded: ${lectureTitle}`;
      const content = `Dear Student,

Your attendance has been successfully recorded!

**Attendance Details:**
• Lecture: ${lectureTitle}
• Course: ${courseName}
• Date: ${new Date(lectureDate).toLocaleDateString()}
• Recorded At: ${new Date(submittedAt).toLocaleString()}

Your attendance has been confirmed and recorded in the system.

Thank you for attending!

Best regards,
StreamLearn Platform`;

      await this.sendNotificationEmail(subject, content, studentEmail);
    } catch (error) {
      console.error('[SubmissionNotificationService] Error sending attendance submission email:', error);
    }
  }

  // Send tutorial submission confirmation email
  static async sendTutorialSubmissionEmail(
    studentId: string,
    studentEmail: string,
    studentName: string,
    tutorialTitle: string,
    fileName: string,
    submittedAt: string,
    codeLines: number,
    hasOutput: boolean
  ): Promise<void> {
    try {
      if (!studentEmail) {
        console.warn('[SubmissionNotificationService] Cannot send tutorial submission email: student email not provided');
        return;
      }

      const subject = `Exercise Submission Confirmation: ${tutorialTitle}`;
      const content = `Dear ${studentName || 'Student'},

Your exercise submission has been successfully received!

**Submission Details:**
• Exercise: ${tutorialTitle}
• File Name: ${fileName}
• Submitted At: ${new Date(submittedAt).toLocaleString()}
• Language: Python
• Code Lines: ${codeLines}
${hasOutput ? `• Output: Available` : ''}

Your submission has been recorded and is now under review. You will be notified once your exercise has been graded.

You can view your submission details in the "Notebook Submissions" section.

Thank you for your submission!

Best regards,
StreamLearn Platform`;

      await this.sendNotificationEmail(subject, content, studentEmail);
    } catch (error) {
      console.error('[SubmissionNotificationService] Error sending tutorial submission email:', error);
    }
  }

  // Send codebook submission confirmation email
  static async sendCodebookSubmissionEmail(
    studentId: string,
    studentEmail: string,
    studentName: string,
    fileName: string,
    groupId: string | undefined,
    submittedAt: string,
    totalCells: number,
    codeCells: number,
    markdownCells: number
  ): Promise<void> {
    try {
      if (!studentEmail) {
        console.warn('[SubmissionNotificationService] Cannot send codebook submission email: student email not provided');
        return;
      }

      const groupInfo = groupId ? `• Group ID: ${groupId}` : '';
      const subject = `Codebook Submission Confirmation: ${fileName}`;
      const content = `Dear ${studentName || 'Student'},

Your collaborative codebook submission has been successfully received!

**Submission Details:**
• File Name: ${fileName}
${groupInfo}
• Submitted At: ${new Date(submittedAt).toLocaleString()}
• Total Cells: ${totalCells}
• Code Cells: ${codeCells}
• Markdown Cells: ${markdownCells}

Your submission has been recorded and is now under review. Your teacher will be able to view your individual submission.

You can view your submission details in the system.

Thank you for your submission!

Best regards,
StreamLearn Platform`;

      await this.sendNotificationEmail(subject, content, studentEmail);
    } catch (error) {
      console.error('[SubmissionNotificationService] Error sending codebook submission email:', error);
    }
  }

  // Send survey submission confirmation email
  static async sendSurveySubmissionEmail(
    studentId: string,
    surveyTitle: string,
    courseName: string,
    totalQuestions: number,
    submittedAt: string
  ): Promise<void> {
    try {
      const studentEmail = await this.getStudentEmail(studentId);
      if (!studentEmail) {
        console.warn('[SubmissionNotificationService] Cannot send survey submission email: student email not found');
        return;
      }

      const subject = `Survey Completed: ${surveyTitle}`;
      const content = `Dear Student,

Your survey submission has been successfully received!

**Survey Details:**
• Survey: ${surveyTitle}
• Course: ${courseName}
• Total Questions: ${totalQuestions}
• Submitted At: ${new Date(submittedAt).toLocaleString()}

Your responses have been recorded. Thank you for completing the survey!

Best regards,
StreamLearn Platform`;

      await this.sendNotificationEmail(subject, content, studentEmail);
    } catch (error) {
      console.error('[SubmissionNotificationService] Error sending survey submission email:', error);
    }
  }

  // Send assignment graded notification email
  static async sendAssignmentGradedEmail(
    studentId: string,
    assignmentTitle: string,
    courseName: string,
    score: number,
    maxScore: number,
    feedback: string | null | undefined,
    gradedAt: string
  ): Promise<void> {
    try {
      const studentEmail = await this.getStudentEmail(studentId);
      if (!studentEmail) {
        console.warn('[SubmissionNotificationService] Cannot send assignment graded email: student email not found');
        return;
      }

      const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
      const feedbackSection = feedback ? `\n\n**Feedback:**\n${feedback}` : '';

      const subject = `Assignment Graded: ${assignmentTitle}`;
      const content = `Dear Student,

Your assignment has been graded!

**Assignment Details:**
• Assignment: ${assignmentTitle}
• Course: ${courseName}
• Score: ${score} / ${maxScore} (${percentage}%)
• Graded At: ${new Date(gradedAt).toLocaleString()}${feedbackSection}

You can view your graded assignment and feedback in the system.

Best regards,
StreamLearn Platform`;

      await this.sendNotificationEmail(subject, content, studentEmail);
    } catch (error) {
      console.error('[SubmissionNotificationService] Error sending assignment graded email:', error);
    }
  }
}

