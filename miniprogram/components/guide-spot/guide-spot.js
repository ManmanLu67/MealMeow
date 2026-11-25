Component({
  properties: {
    hole: { type: Object, value: null },
    bubble: { type: Object, value: null },
    icon: { type: String, value: '' },
    lead: { type: String, value: '' },
    rest: { type: String, value: '' },
    next: { type: String, value: '下一步' },
  },

  methods: {
    hold() {},
    onNext() { this.triggerEvent('next') },
  },
})
