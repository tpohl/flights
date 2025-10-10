import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { FlightsExportComponent } from './flights-export.component';

describe('FlightsExportComponent', () => {
  let component: FlightsExportComponent;
  let fixture: ComponentFixture<FlightsExportComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [ FlightsExportComponent ]
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
