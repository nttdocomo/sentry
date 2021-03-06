import React from 'react';

import Feature from 'app/components/acl/feature';

export default function OrganizationIncidentRules({children}) {
  return (
    <Feature features={['incidents']} renderDisabled>
      {children}
    </Feature>
  );
}
