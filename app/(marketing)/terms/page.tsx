'use client';
import { MarketingHeader } from '@/components/marketing/MarketingHeader';

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <MarketingHeader />
      
      {/* Main Content Area */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Centered Header */}
        <div className="text-center py-8">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4 leading-tight">
            Our User Agreements &<br/> Terms of Service
          </h1>
        </div>

        {/* Last Updated */}
        <p className="text-gray-600 mb-8">
          Last Updated: April 21, 2026
        </p>

        {/* Google API Disclosure Box */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-12">
          <h2 className="text-lg font-bold text-gray-800 mb-2">Google API Disclosure</h2>
          <p className="text-gray-700">
            Trailblaize&apos;s use of information received from Google APIs will adhere to{' '}
            <a 
              href="https://developers.google.com/terms/api-services-user-data-policy" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-brand-accent hover:underline font-semibold"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
        </div>

        {/* Terms Content - Plain Text */}
        <div className="space-y-2 text-gray-700 leading-relaxed">
          <p>
            These Terms and Conditions (&quot;Terms&quot;) govern your use of Trailblaize, Inc.&apos;s services
            (&quot;Trailblaize,&quot; &quot;we,&quot; &quot;our,&quot; &quot;us&quot;). By creating an account or using Trailblaize, you agree to these Terms.
          </p>

          <h2 className="text-2xl font-bold text-gray-900 pt-4 pb-2">1. Use of Services</h2>
          <ul className="list-disc list-inside space-y-1 pl-4">
            <li>You must be a current member, alumnus, or authorized user of a participating chapter to access Trailblaize.</li>
            <li>You agree to provide accurate account information and keep it up to date.</li>
            <li>You may not use Trailblaize for unlawful, harmful, or unauthorized purposes.</li>
          </ul>

          <h2 className="text-2xl font-bold text-gray-900 pt-4 pb-2">2. User-Generated Content and Community Standards</h2>
          <p>
            Trailblaize may allow you and other users to submit, upload, or post content such as text,
            images, links, comments, messages, and similar materials (&quot;User Content&quot;). You retain
            ownership of your User Content, but you grant Trailblaize a license to host, display, store,
            and moderate User Content as needed to operate and improve the services.
          </p>
          <p className="pt-2">
            <strong>Zero tolerance.</strong> There is no tolerance on Trailblaize for objectionable
            content or abusive users. Objectionable content includes, without limitation, content that is
            unlawful, harassing, hateful, discriminatory, sexually explicit involving minors, gratuitously
            violent, or otherwise inappropriate in a chapter or school community context. Abusive behavior
            includes stalking, threats, bullying, spam, impersonation intended to deceive, and coordinated
            harassment.
          </p>
          <ul className="list-disc list-inside space-y-1 pl-4 pt-2">
            <li>
              You are responsible for your User Content and for complying with applicable law, your chapter&apos;s
              policies, and these Terms.
            </li>
            <li>
              We may investigate reports of violations and may remove or restrict User Content, suspend or
              terminate accounts, block users, or take other moderation actions we consider appropriate,
              with or without prior notice, to protect users and the integrity of the platform.
            </li>
            <li>
              We may provide tools for users to flag objectionable content and to block abusive users where
              those features are available in the product. You agree to use those tools in good faith and
              not to misuse reporting systems.
            </li>
          </ul>

          <h2 className="text-2xl font-bold text-gray-900 pt-4 pb-2">3. Accounts and Security</h2>
          <ul className="list-disc list-inside space-y-1 pl-4">
            <li>You are responsible for maintaining the confidentiality of your login information.</li>
            <li>You are responsible for all activity under your account.</li>
            <li>Notify us immediately if you suspect unauthorized use of your account.</li>
          </ul>

          <h2 className="text-2xl font-bold text-gray-900 pt-4 pb-2">4. Communications</h2>
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
            <p className="font-bold text-yellow-800 mb-2">Important: Communication Terms</p>
            <ul className="list-disc list-inside ml-4 text-yellow-800 space-y-1">
              <li>By creating an account, you agree to receive communications from Trailblaize via email.</li>
              <li><strong>SMS communications are optional</strong> and require separate consent.</li>
              <li>You may unsubscribe from emails by using the unsubscribe link and from SMS by replying STOP.</li>
            </ul>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 pt-4 pb-2">5. Intellectual Property</h2>
          <ul className="list-disc list-inside space-y-1 pl-4">
            <li>All content and technology within Trailblaize is owned or licensed by Trailblaize, Inc.</li>
            <li>You may not copy, modify, or distribute Trailblaize content without permission.</li>
          </ul>

          <h2 className="text-2xl font-bold text-gray-900 pt-4 pb-2">6. Limitation of Liability</h2>
          <p>
            Trailblaize is provided &ldquo;as is.&rdquo; To the fullest extent permitted by law, Trailblaize is not liable for damages arising from your use of the platform, including lost data, service interruptions, or unauthorized access.
          </p>

          <h2 className="text-2xl font-bold text-gray-900 pt-4 pb-2">7. Termination</h2>
          <p>
            We may suspend or terminate your account if you violate these Terms or misuse the platform,
            including for violations of our community standards or repeated abusive behavior.
          </p>

          <h2 className="text-2xl font-bold text-gray-900 pt-4 pb-2">8. Governing Law</h2>
          <p>
            These Terms are governed by the laws of the State of Delaware, without regard to conflict of law principles.
          </p>

          <h2 className="text-2xl font-bold text-gray-900 pt-4 pb-2">9. Contact Us</h2>
          <p>
            <strong>Trailblaize, Inc.</strong><br />
            1111B South Governors Avenue<br />
            Dover, DE 19904<br />
            <a href="mailto:support@trailblaize.net" className="text-brand-accent hover:underline">support@trailblaize.net</a>
          </p>
        </div>
      </div>
    </div>
  );
}