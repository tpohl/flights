import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { FlightsExportComponent } from './flights-export.component';

describe('FlightsExportComponent', () => {
  let component: FlightsExportComponent;
  let fixture: ComponentFixture<FlightsExportComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ FlightsExportComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(FlightsExportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
