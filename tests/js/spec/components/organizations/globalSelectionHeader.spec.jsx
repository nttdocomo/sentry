import React from 'react';

import {initializeOrg} from 'app-test/helpers/initializeOrg';
import {mount} from 'enzyme';
import GlobalSelectionHeader from 'app/components/organizations/globalSelectionHeader';
import GlobalSelectionStore from 'app/stores/globalSelectionStore';
import * as globalActions from 'app/actionCreators/globalSelection';
import ProjectsStore from 'app/stores/projectsStore';

const changeQuery = (routerContext, query) => ({
  ...routerContext,
  context: {
    ...routerContext.context,
    router: {
      ...routerContext.context.router,
      location: {
        query,
      },
    },
  },
});

describe('GlobalSelectionHeader', function() {
  const {organization, router, routerContext} = initializeOrg({
    organization: TestStubs.Organization({features: ['global-views']}),
    router: {
      location: {query: {}},
    },
  });

  beforeAll(function() {
    jest.spyOn(globalActions, 'updateDateTime');
    jest.spyOn(globalActions, 'updateEnvironments');
    jest.spyOn(globalActions, 'updateProjects');
  });

  beforeEach(function() {
    GlobalSelectionStore.reset();
    [
      globalActions.updateDateTime,
      globalActions.updateProjects,
      globalActions.updateEnvironments,
      router.push,
      router.replace,
    ].forEach(mock => mock.mockClear());
  });

  it('does not update router if there is custom routing', function() {
    mount(
      <GlobalSelectionHeader organization={organization} hasCustomRouting />,
      routerContext
    );
    expect(router.push).not.toHaveBeenCalled();
  });

  it('replaces URL with values from store when mounted with no query params', function() {
    mount(<GlobalSelectionHeader organization={organization} />, routerContext);

    expect(router.replace).toHaveBeenCalledWith(
      expect.objectContaining({
        query: {
          environment: [],
          project: [],
          statsPeriod: '14d',
          utc: 'true',
        },
      })
    );
  });

  it('only updates GlobalSelection store when mounted with query params', async function() {
    mount(
      <GlobalSelectionHeader organization={organization} />,
      changeQuery(routerContext, {
        statsPeriod: '7d',
      })
    );

    expect(router.push).not.toHaveBeenCalled();
    expect(globalActions.updateDateTime).toHaveBeenCalledWith({
      period: '7d',
      utc: null,
      start: null,
      end: null,
    });
    expect(globalActions.updateProjects).toHaveBeenCalledWith([]);
    expect(globalActions.updateEnvironments).toHaveBeenCalledWith([]);

    await tick();

    expect(GlobalSelectionStore.get()).toEqual({
      datetime: {
        period: '7d',
        utc: null,
        start: null,
        end: null,
      },
      environments: [],
      projects: [],
    });
  });

  it('updates GlobalSelection store when re-rendered with different query params', async function() {
    const wrapper = mount(
      <GlobalSelectionHeader organization={organization} />,
      changeQuery(routerContext, {
        statsPeriod: '7d',
      })
    );

    wrapper.setContext(
      changeQuery(routerContext, {
        statsPeriod: '21d',
      }).context
    );
    await tick();
    wrapper.update();

    expect(globalActions.updateDateTime).toHaveBeenCalledWith({
      period: '21d',
      utc: null,
      start: null,
      end: null,
    });
    expect(globalActions.updateProjects).toHaveBeenCalledWith([]);
    expect(globalActions.updateEnvironments).toHaveBeenCalledWith([]);

    expect(GlobalSelectionStore.get()).toEqual({
      datetime: {
        period: '21d',
        utc: null,
        start: null,
        end: null,
      },
      environments: [],
      projects: [],
    });
  });

  it('updates GlobalSelection store with default period', async function() {
    mount(
      <GlobalSelectionHeader organization={organization} />,
      changeQuery(routerContext, {
        environment: 'prod',
      })
    );

    expect(router.push).not.toHaveBeenCalled();
    expect(globalActions.updateDateTime).toHaveBeenCalledWith({
      period: '14d',
      utc: null,
      start: null,
      end: null,
    });
    expect(globalActions.updateProjects).toHaveBeenCalledWith([]);
    expect(globalActions.updateEnvironments).toHaveBeenCalledWith(['prod']);

    await tick();

    expect(GlobalSelectionStore.get()).toEqual({
      datetime: {
        period: '14d',
        utc: null,
        start: null,
        end: null,
      },
      environments: ['prod'],
      projects: [],
    });
  });

  it('does not update store if url params have not changed', async function() {
    const wrapper = mount(
      <GlobalSelectionHeader organization={organization} />,
      changeQuery(routerContext, {
        statsPeriod: '7d',
      })
    );

    [
      globalActions.updateDateTime,
      globalActions.updateProjects,
      globalActions.updateEnvironments,
    ].forEach(mock => mock.mockClear());

    wrapper.setContext(
      changeQuery(routerContext, {
        statsPeriod: '7d',
      }).context
    );

    await tick();
    wrapper.update();

    expect(globalActions.updateDateTime).not.toHaveBeenCalled();
    expect(globalActions.updateProjects).not.toHaveBeenCalled();
    expect(globalActions.updateEnvironments).not.toHaveBeenCalled();

    expect(GlobalSelectionStore.get()).toEqual({
      datetime: {
        period: '7d',
        utc: null,
        start: null,
        end: null,
      },
      environments: [],
      projects: [],
    });
  });

  describe('Single project selection mode', function() {
    it('selects first project if more than one is requested', function() {
      const initializationObj = initializeOrg({
        router: {
          location: {query: {project: [1, 2]}},
        },
      });

      mount(
        <GlobalSelectionHeader organization={initializationObj.organization} />,
        initializationObj.routerContext
      );

      expect(globalActions.updateProjects).toHaveBeenCalledWith([1]);
    });

    it('selects first project if none (i.e. all) is requested', function() {
      const project = TestStubs.Project({id: '3'});
      const org = TestStubs.Organization({projects: [project]});
      ProjectsStore.loadInitialData(org.projects);

      const initializationObj = initializeOrg({
        organization: org,
        router: {
          location: {query: {}},
        },
      });

      mount(
        <GlobalSelectionHeader organization={initializationObj.organization} />,
        initializationObj.routerContext
      );

      expect(globalActions.updateProjects).toHaveBeenCalledWith([3]);
    });
  });

  describe('forceProject selection mode', function() {
    const initialData = initializeOrg({
      organization: {features: ['global-views']},
      projects: [
        {id: 1, slug: 'staging-project', environments: ['staging']},
        {id: 2, slug: 'prod-project', environments: ['prod']},
      ],
      router: {
        location: {query: {}},
      },
    });

    const wrapper = mount(
      <GlobalSelectionHeader
        organization={initialData.organization}
        forceProject={initialData.organization.projects[0]}
      />,
      initialData.routerContext
    );

    it('renders a back button to the forced project', function() {
      const back = wrapper.find('BackButtonWrapper');
      expect(back).toHaveLength(1);
    });

    it('renders only environments from the forced project', async function() {
      await wrapper.find('MultipleEnvironmentSelector HeaderItem').simulate('click');
      await wrapper.update();

      const items = wrapper.find('MultipleEnvironmentSelector EnvironmentSelectorItem');
      expect(items.length).toEqual(1);
      expect(items.at(0).text()).toBe('staging');
    });
  });
});
