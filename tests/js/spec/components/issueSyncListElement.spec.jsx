import React from 'react';
import {shallow, mount} from 'enzyme';
import IssueSyncListElement from 'app/components/issueSyncListElement';

describe('AlertLink', function() {
  it('renders', function() {
    const wrapper = shallow(<IssueSyncListElement integrationType="github" />);
    expect(wrapper).toMatchSnapshot();
  });

  it('can open', function() {
    const onOpen = jest.fn();
    const wrapper = shallow(
      <IssueSyncListElement integrationType="github" onOpen={onOpen} />
    );
    expect(onOpen).not.toHaveBeenCalled();
    wrapper.find('IntegrationLink').simulate('click');
    expect(onOpen).toHaveBeenCalled();
  });

  it('can close', function() {
    const onClose = jest.fn();
    const onOpen = jest.fn();

    const wrapper = mount(
      <IssueSyncListElement
        integrationType="github"
        externalIssueLink="github.com/issues/gh-101"
        externalIssueId={101}
        onClose={onClose}
        onOpen={onOpen}
      />
    );

    expect(onClose).not.toHaveBeenCalled();
    wrapper.find('OpenCloseIcon').simulate('click');
    expect(onClose).toHaveBeenCalled();
  });
});
