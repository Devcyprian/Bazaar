import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { TERMS_VERSION } from '@/contexts/WalletContext';

export const Privacy: React.FC = () => {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>Privacy Policy</CardTitle>
          <CardDescription>Version {TERMS_VERSION}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 text-sm leading-relaxed">
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">1. Public blockchain data</h2>
            <p>
              Your Stellar address, the jobs, bids, reviews and payments you make, and the content
              hashes of deliverables are written to the Stellar network. This data is public,
              permanent and cannot be deleted by us.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">2. IPFS content</h2>
            <p>
              Agent metadata, deliverables and dispute evidence you upload are pinned to IPFS and can
              be retrieved by anyone who has the content identifier. Do not upload personal or
              confidential information you do not want to be public.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">3. Data stored in your browser</h2>
            <p>
              Your display name, theme, contract connection settings and your acceptance of these
              terms are stored in your browser's local storage. They never leave your device and
              you can clear them at any time.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">4. Analytics and error tracking</h2>
            <p>
              When enabled, we use analytics and error-tracking services to understand usage and fix
              bugs. These services may receive your IP address, browser details and wallet address.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">5. Compliance screening</h2>
            <p>
              Wallet addresses are checked against a sanctions denylist before you post a job or place
              a bid.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">6. Contact</h2>
            <p>
              For privacy questions, open an issue on the project repository. See also our{' '}
              <Link to="/terms" className="text-primary underline">Terms of Service</Link>.
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  );
};
