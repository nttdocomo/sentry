import React from 'react';
import {shallow} from 'enzyme';
import Cookies from 'js-cookie';
import _ from 'lodash';

import {Client} from 'app/api';
import CursorPoller from 'app/utils/cursorPoller';
import LoadingError from 'app/components/loadingError';
import ErrorRobot from 'app/components/errorRobot';
import {Stream} from 'app/views/stream/stream';
import EnvironmentStore from 'app/stores/environmentStore';
import {setActiveEnvironment} from 'app/actionCreators/environments';
import TagStore from 'app/stores/tagStore';

jest.mock('app/stores/groupStore');

const DEFAULT_LINKS_HEADER =
  '<http://127.0.0.1:8000/api/0/projects/org-slug/project-slug/issues/?cursor=1443575731:0:1>; rel="previous"; results="false"; cursor="1443575731:0:1", ' +
  '<http://127.0.0.1:8000/api/0/projects/org-slug/project-slug/issues/?cursor=1443575731:0:0>; rel="next"; results="true"; cursor="1443575731:0:0';

describe('Stream', function() {
  let context;
  let wrapper;
  let props;

  let organization;
  let team;
  let project;
  let savedSearch;

  let groupListRequest;

  beforeEach(function() {
    organization = TestStubs.Organization({
      id: '1337',
      slug: 'org-slug',
    });
    team = TestStubs.Team({
      id: '2448',
    });
    project = TestStubs.ProjectDetails({
      id: 3559,
      name: 'Foo Project',
      slug: 'project-slug',
      firstEvent: true,
    });
    savedSearch = {id: '789', query: 'is:unresolved', name: 'test'};

    groupListRequest = MockApiClient.addMockResponse({
      url: '/projects/org-slug/project-slug/issues/',
      body: [TestStubs.Group()],
      headers: {
        Link: DEFAULT_LINKS_HEADER,
      },
    });
    MockApiClient.addMockResponse({
      url: '/projects/org-slug/project-slug/searches/',
      body: [savedSearch],
    });
    MockApiClient.addMockResponse({
      url: '/organizations/org-slug/recent-searches/',
      body: [],
    });
    MockApiClient.addMockResponse({
      url: '/organizations/org-slug/processingissues/',
      method: 'GET',
    });

    context = {
      project,
      organization,
      team,
    };

    TagStore.init();

    props = {
      api: new MockApiClient(),
      setProjectNavSection: function() {},
      location: {query: {query: 'is:unresolved'}, search: 'query=is:unresolved'},
      params: {orgId: organization.slug, projectId: project.slug},
      tags: TagStore.getAllTags(),
      tagsLoading: false,
    };
  });

  afterEach(function() {
    MockApiClient.clearMockResponses();
  });

  describe('fetchData()', function() {
    describe('complete handler', function() {
      beforeAll(function() {
        jest.spyOn(CursorPoller.prototype, 'setEndpoint');
      });

      beforeEach(function() {
        CursorPoller.prototype.setEndpoint.mockReset();
        wrapper = shallow(<Stream {...props} />, {
          context,
        });
      });

      afterAll(function() {
        CursorPoller.prototype.setEndpoint.mockRestore();
      });

      it('should reset the poller endpoint and sets cursor URL', function() {
        const stream = wrapper.instance();
        stream.state.pageLinks = DEFAULT_LINKS_HEADER;
        stream.state.realtimeActive = true;

        stream.fetchData();

        expect(CursorPoller.prototype.setEndpoint).toHaveBeenCalledWith(
          'http://127.0.0.1:8000/api/0/projects/org-slug/project-slug/issues/?cursor=1443575731:0:1'
        );
      });

      it('should not enable the poller if realtimeActive is false', function() {
        const stream = wrapper.instance();
        stream.state.pageLinks = DEFAULT_LINKS_HEADER;
        stream.state.realtimeActive = false;
        stream.fetchData();

        expect(CursorPoller.prototype.setEndpoint).not.toHaveBeenCalled();
      });

      it("should not enable the poller if the 'previous' link has results", function() {
        const pageLinks =
          '<http://127.0.0.1:8000/api/0/projects/org-slug/project-slug/issues/?cursor=1443575731:0:1>; rel="previous"; results="true"; cursor="1443575731:0:1", ' +
          '<http://127.0.0.1:8000/api/0/projects/org-slug/project-slug/issues/?cursor=1443575731:0:0>; rel="next"; results="true"; cursor="1443575731:0:0';

        MockApiClient.addMockResponse({
          url: '/projects/org-slug/project-slug/issues/',
          body: [TestStubs.Group()],
          headers: {
            Link: pageLinks,
          },
        });

        wrapper = shallow(<Stream {...props} />, {
          context,
        });

        const stream = wrapper.instance();

        stream.setState({
          pageLinks,
          realtimeActive: true,
        });

        stream.fetchData();

        expect(CursorPoller.prototype.setEndpoint).not.toHaveBeenCalled();
      });
    }); // complete handler

    it('calls fetchData once on mount for a saved search', async function() {
      props.location = {query: {}};
      props.params.searchId = '1';
      wrapper = shallow(<Stream {...props} />, {
        context,
      });
      await wrapper.update();

      expect(groupListRequest).toHaveBeenCalledTimes(1);
    });

    it('calls fetchData once on mount if there is a query', async function() {
      wrapper = shallow(<Stream {...props} />, {
        context,
      });
      await wrapper.update();

      expect(groupListRequest).toHaveBeenCalledTimes(1);
    });

    it('should cancel any previous, unfinished fetches', function() {
      const requestCancel = jest.fn();
      let requestOptions;
      jest.spyOn(Client.prototype, 'request').mockImplementation(function(url, options) {
        requestOptions = options;
        return {
          cancel: requestCancel,
        };
      });

      // NOTE: fetchData called once after render automatically
      const stream = wrapper.instance();

      // 2nd fetch should call cancel
      stream.fetchData();
      stream.fetchData();

      expect(requestCancel).toHaveBeenCalledTimes(1);
      expect(stream.lastRequest).toBeTruthy();

      // when request "completes", lastRequest is cleared
      requestOptions.complete({
        getResponseHeader: () => DEFAULT_LINKS_HEADER,
      });

      expect(stream.lastRequest).toBeNull();
      Client.prototype.request.mockRestore();
    });

    it('sends environment attribute', function() {
      const requestCancel = jest.fn();
      let requestOptions;
      jest.spyOn(Client.prototype, 'request').mockImplementation(function(url, options) {
        requestOptions = options;
        return {
          cancel: requestCancel,
        };
      });

      const stream = wrapper.instance();
      stream.state.activeEnvironment = {name: 'prod'};
      stream.state.query = 'is:unresolved environment:prod';
      stream.fetchData();

      expect(requestOptions.data.query).toContain('environment:prod');
      expect(requestOptions.data.environment).toBe('prod');
      Client.prototype.request.mockRestore();
    });
  });

  describe('fetchSavedSearches()', function() {
    it('handles valid search id', async function() {
      const streamProps = {
        api: new MockApiClient(),
        setProjectNavSection: function() {},
        params: {orgId: 'org-slug', projectId: 'project-slug', searchId: '789'},
        location: {query: {}, search: ''},
        tags: {},
      };
      wrapper = shallow(<Stream {...streamProps} />, {
        context,
      });
      await wrapper.update();

      expect(wrapper.instance().state.searchId).toBe('789');
      expect(wrapper.instance().state.query).toBe('is:unresolved');
    });

    it('handles invalid search id', async function() {
      const streamProps = {
        api: new MockApiClient(),
        setProjectNavSection: function() {},
        params: {orgId: 'org-slug', projectId: 'project-slug', searchId: 'invalid'},
        location: {query: {}, search: ''},
        tags: {},
      };
      wrapper = shallow(<Stream {...streamProps} />, {
        context,
      });
      await wrapper.update();

      expect(wrapper.instance().state.searchId).toBeNull();
      expect(wrapper.instance().state.query).toBe('');
    });

    it('handles default saved search (no search id or query)', async function() {
      const streamProps = {
        ...props,
        location: {query: {}, search: ''},
      };

      MockApiClient.addMockResponse({
        url: '/projects/org-slug/project-slug/searches/',
        body: [
          {...savedSearch, isDefault: false},
          {
            id: 'default',
            query: 'is:unresolved assigned:me',
            name: 'default',
            isDefault: true,
          },
        ],
      });

      wrapper = shallow(<Stream {...streamProps} />, {
        context,
      });
      await wrapper.update();

      expect(wrapper.instance().state.searchId).toBe('default');
      expect(wrapper.instance().state.query).toBe('is:unresolved assigned:me');
    });
  });

  describe('render()', function() {
    beforeEach(function() {
      wrapper = shallow(<Stream {...props} />, {
        context,
      });
    });
    it('displays a loading indicator when component is loading', function() {
      wrapper.setState({loading: true});
      expect(wrapper.find('.loading')).toBeTruthy();
    });

    it('displays a loading indicator when data is loading', function() {
      wrapper.setState({dataLoading: true});
      expect(wrapper.find('.loading')).toBeTruthy();
    });

    it('displays an error when component has errored', function() {
      wrapper.setState({
        error: 'Something bad happened',
        loading: false,
        dataLoading: false,
      });
      expect(wrapper.find(LoadingError).length).toBeTruthy();
    });

    it('displays the group list', function() {
      wrapper.setState({
        error: false,
        groupIds: ['1'],
        loading: false,
        dataLoading: false,
      });
      expect(wrapper).toMatchSnapshot();
      expect(wrapper.find('.ref-group-list').length).toBeTruthy();
    });

    it('displays empty with no ids', function() {
      wrapper.setState({
        error: false,
        groupIds: [],
        loading: false,
        dataLoading: false,
      });
      expect(wrapper.find('EmptyStateWarning').length).toBeTruthy();
    });

    describe('no first event sent', function() {
      it('shows "awaiting events" message when no events have been sent', function() {
        context.project.firstEvent = false;
        wrapper.setState({
          error: false,
          groupIds: [],
          loading: false,
          dataLoading: false,
        });

        expect(wrapper.find(ErrorRobot)).toHaveLength(1);
      });

      it('does not show "awaiting events" when an event is recieved', function() {
        context.project.firstEvent = false;
        wrapper.setState({
          error: false,
          groupIds: ['1'],
          loading: false,
          dataLoading: false,
        });

        expect(wrapper.find('.ref-group-list').length).toBeTruthy();
      });
    });

    it('does not have real time event updates when events exist', function() {
      wrapper = shallow(<Stream {...wrapper.instance().props} />, {
        context: {
          ...context,
          project: {
            ...context.project,
            firstEvent: true,
          },
        },
      });

      expect(wrapper.state('realtimeActive')).toBe(false);
    });

    it('does not have real time event updates enabled when cookie is present (even if there are no events)', function() {
      Cookies.set('realtimeActive', 'false');
      wrapper = shallow(<Stream {...wrapper.instance().props} />, {
        context: {
          ...context,
          project: {
            ...context.project,
            firstEvent: false,
          },
        },
      });

      wrapper.setState({
        error: false,
        groupIds: [],
        loading: false,
        dataLoading: false,
      });

      Cookies.remove('realtimeActive');
      expect(wrapper.state('realtimeActive')).toBe(false);
    });

    it('has real time event updates enabled when there are no events', function() {
      wrapper = shallow(<Stream {...wrapper.instance().props} />, {
        context: {
          ...context,
          project: {
            ...context.project,
            firstEvent: false,
          },
        },
      });

      wrapper.setState({
        error: false,
        groupIds: [],
        loading: false,
        dataLoading: false,
      });

      expect(wrapper.state('realtimeActive')).toBe(true);
    });
  });

  describe('toggles environment', function() {
    beforeEach(function() {
      wrapper = shallow(<Stream {...props} />, {
        context,
      });
    });

    it('select all environments', function() {
      EnvironmentStore.loadInitialData(TestStubs.Environments());
      setActiveEnvironment(null);
      wrapper.setState({
        error: false,
        groupIds: ['1'],
        loading: false,
        dataLoading: false,
      });
      expect(wrapper).toMatchSnapshot();
    });
  });

  describe('componentWillMount()', function() {
    afterEach(function() {
      Cookies.remove('realtimeActive');
    });

    it('reads the realtimeActive state from a cookie', function() {
      Cookies.set('realtimeActive', 'false');

      const stream = wrapper.instance();
      expect(stream.getInitialState()).toHaveProperty('realtimeActive', false);
    });

    it('reads the true realtimeActive state from a cookie', function() {
      Cookies.set('realtimeActive', 'true');

      const stream = wrapper.instance();
      expect(stream.getInitialState()).toHaveProperty('realtimeActive', true);
    });
  });

  describe('onRealtimeChange', function() {
    it('sets the realtimeActive state', function() {
      const stream = wrapper.instance();
      stream.state.realtimeActive = false;
      stream.onRealtimeChange(true);
      expect(stream.state.realtimeActive).toEqual(true);
      expect(Cookies.get('realtimeActive')).toEqual('true');

      stream.onRealtimeChange(false);
      expect(stream.state.realtimeActive).toEqual(false);
      expect(Cookies.get('realtimeActive')).toEqual('false');
    });
  });

  describe('getInitialState', function() {
    it('handles query', function() {
      const expected = {
        groupIds: [],
        selectAllActive: false,
        multiSelected: false,
        anySelected: false,
        statsPeriod: '24h',
        realtimeActive: false,
        pageLinks: '',
        loading: false,
        dataLoading: true,
        error: false,
        searchId: null,
        query: 'is:unresolved',
        sort: 'date',
      };

      const actual = wrapper.instance().getInitialState();
      expect(_.pick(actual, _.keys(expected))).toEqual(expected);
    });

    it('handles no searchId or query', async function() {
      const streamProps = {
        ...props,
        location: {query: {sort: 'freq'}, search: 'sort=freq'},
      };

      const expected = {
        groupIds: [],
        selectAllActive: false,
        multiSelected: false,
        anySelected: false,
        statsPeriod: '24h',
        realtimeActive: false,
        loading: false,
        dataLoading: false,
        error: false,
        query: '',
        sort: 'freq',
        searchId: null,
      };

      wrapper = shallow(<Stream {...streamProps} />, {
        context,
      });
      await wrapper.update();

      const stream = wrapper.instance();

      const actual = stream.state;
      expect(_.pick(actual, _.keys(expected))).toEqual(expected);
    });

    it('handles valid searchId in routing params', async function() {
      const streamProps = {
        ...props,
        location: {query: {sort: 'freq'}, search: 'sort=freq'},
        params: {orgId: 'org-slug', projectId: 'project-slug', searchId: '789'},
      };

      const expected = {
        groupIds: [],
        selectAllActive: false,
        multiSelected: false,
        anySelected: false,
        statsPeriod: '24h',
        realtimeActive: false,
        loading: false,
        dataLoading: false,
        error: false,
        query: 'is:unresolved',
        sort: 'freq',
        searchId: '789',
      };

      wrapper = shallow(<Stream {...streamProps} />, {
        context,
      });

      wrapper.setState({
        savedSearchList: [{id: '789', query: 'is:unresolved', name: 'test'}],
      });
      await wrapper.update();

      const actual = wrapper.instance().state;
      expect(_.pick(actual, _.keys(expected))).toEqual(expected);
    });

    it('handles invalid searchId in routing params', async function() {
      const streamProps = {
        ...props,
        location: {query: {sort: 'freq'}, search: 'sort=freq'},
        params: {orgId: 'org-slug', projectId: 'project-slug', searchId: '799'},
      };

      const expected = {
        groupIds: [],
        selectAllActive: false,
        multiSelected: false,
        anySelected: false,
        statsPeriod: '24h',
        realtimeActive: false,
        loading: false,
        dataLoading: false,
        error: false,
        query: '',
        sort: 'freq',
        searchId: null,
      };

      wrapper = shallow(<Stream {...streamProps} />, {
        context,
      });
      await wrapper.update();
      const stream = wrapper.instance();

      const actual = stream.state;
      expect(_.pick(actual, _.keys(expected))).toEqual(expected);
    });
  });

  describe('getQueryState', function() {
    it('handles changed search id', async function() {
      const nextProps = {
        ...props,
        location: {
          pathname: '/org-slug/project-slug/searches/789/',
        },
        params: {orgId: 'org-slug', projectId: 'project-slug', searchId: '789'},
      };

      wrapper = shallow(<Stream {...props} />, {
        context,
      });
      await wrapper.update();
      const stream = wrapper.instance();

      const nextState = stream.getQueryState(nextProps);
      expect(nextState).toEqual(
        expect.objectContaining({searchId: '789', query: 'is:unresolved'})
      );
    });

    it('handles changed querystring', function() {
      const nextProps = {
        ...props,
        location: {
          query: {
            query: 'is:unresolved assigned:me',
          },
        },
      };

      const stream = shallow(<Stream {...props} />, {
        context,
      }).instance();
      const nextState = stream.getQueryState(nextProps);
      expect(nextState).toEqual(
        expect.objectContaining({searchId: null, query: 'is:unresolved assigned:me'})
      );
    });
  });
});
