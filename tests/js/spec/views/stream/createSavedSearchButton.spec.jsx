import React from 'react';
import {mount} from 'enzyme';

import CreateSavedSearchButton from 'app/views/stream/createSavedSearchButton';

describe('CreateSavedSearchButton', function() {
  let wrapper, organization, createMock;

  beforeEach(function() {
    organization = TestStubs.Organization({
      features: ['org-saved-searches'],
      access: ['org:write'],
    });
    wrapper = mount(
      <CreateSavedSearchButton
        organization={organization}
        query="is:unresolved assigned:lyn@sentry.io"
      />,
      TestStubs.routerContext()
    );

    createMock = MockApiClient.addMockResponse({
      url: '/organizations/org-slug/searches/',
      method: 'POST',
      body: {id: '1', name: 'test', query: 'is:unresolved assigned:lyn@sentry.io'},
    });
  });

  afterEach(function() {
    MockApiClient.clearMockResponses();
  });

  describe('saves a search', function() {
    it('clicking save search opens modal', function() {
      expect(wrapper.find('ModalDialog')).toHaveLength(0);
      wrapper.find('button[data-test-id="save-current-search"]').simulate('click');
      expect(wrapper.find('ModalDialog')).toHaveLength(1);
    });

    it('saves a search', async function() {
      wrapper.find('button[data-test-id="save-current-search"]').simulate('click');
      wrapper.find('#id-name').simulate('change', {target: {value: 'new search name'}});
      wrapper
        .find('ModalDialog')
        .find('Button[priority="primary"]')
        .simulate('submit');

      await tick();
      expect(createMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          data: {
            name: 'new search name',
            query: 'is:unresolved assigned:lyn@sentry.io',
            type: 0,
          },
        })
      );
    });

    it('hides button if no feature', function() {
      const orgWithoutFeature = TestStubs.Organization({
        features: [],
        access: ['org:write'],
      });
      wrapper.setProps({organization: orgWithoutFeature});

      const button = wrapper.find('StyledButton');
      expect(button).toHaveLength(0);
    });

    it('hides button if no access', function() {
      const orgWithoutAccess = TestStubs.Organization({
        features: ['org-saved-searches'],
        access: ['org:read'],
      });
      wrapper.setProps({organization: orgWithoutAccess});

      const button = wrapper.find('StyledButton');
      expect(button).toHaveLength(0);
    });
  });
});
